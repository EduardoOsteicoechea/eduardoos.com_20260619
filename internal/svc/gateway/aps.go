package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos/pkg/aps"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

type triggerWorkItemRequest struct {
	ActivityID    string `json:"activityId,omitempty"`
	InputObjectKey string `json:"inputObjectKey,omitempty"`
	OutputFile    string `json:"outputFileName,omitempty"`
}

type triggerWorkItemResponse struct {
	Message        string              `json:"message"`
	CorrelationID  string              `json:"correlationId"`
	Input          aps.PresignResult   `json:"input"`
	Output         aps.PresignResult   `json:"output"`
	WorkItem       map[string]any      `json:"workItem"`
	WorkItemStatus map[string]any      `json:"workItemStatus,omitempty"`
	ExtractedData  map[string]any      `json:"extractedData,omitempty"`
	Request        aps.WorkItemRequest `json:"request"`
}

func registerAPSRoutes(r chi.Router, cfg config) {
	r.Post("/api/aps/trigger-workitem", cfg.triggerAPSWorkItem())
}

func (c config) triggerAPSWorkItem() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			logs := []string{
				"aps.trigger-workitem: JWT subject extraction failed",
				"aps.trigger-workitem: error=" + err.Error(),
			}
			log.Printf("[correlation=%s] aps.trigger-workitem auth failed: %v", cid, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "error"), cid)
			common.WriteErrorWithDebug(w, http.StatusUnauthorized, err.Error(), cid, logs)
			return
		}
		if !aps.IsAdminEmail(email) {
			logs := []string{
				"aps.trigger-workitem: caller is not the APS admin allowlist email",
				"aps.trigger-workitem: email=" + email,
			}
			log.Printf("[correlation=%s] aps.trigger-workitem forbidden email=%s", cid, email)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "error"), cid)
			common.WriteErrorWithDebug(w, http.StatusForbidden, "forbidden", cid, logs)
			return
		}

		var body triggerWorkItemRequest
		raw, _ := io.ReadAll(r.Body)
		if len(strings.TrimSpace(string(raw))) > 0 {
			if err := json.Unmarshal(raw, &body); err != nil {
				common.WriteError(w, http.StatusBadRequest, "invalid JSON body")
				c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "error"), cid)
				return
			}
		}

		result, status, err := executeAPSWorkItem(r.Context(), body)
		if err != nil {
			logs := []string{
				"aps.trigger-workitem: execution failed",
				"aps.trigger-workitem: error=" + err.Error(),
			}
			log.Printf("[correlation=%s] aps.trigger-workitem failed: %v", cid, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "error"), cid)
			if status == 0 {
				status = http.StatusBadGateway
			}
			if status < 400 {
				status = http.StatusBadGateway
			}
			common.WriteErrorWithDebug(w, status, err.Error(), cid, logs)
			return
		}

		result.CorrelationID = cid
		if result.Message == "" {
			result.Message = "APS WorkItem completed"
		}
		log.Printf("[correlation=%s] aps.trigger-workitem success outputKey=%s", cid, result.Output.ObjectKey)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "success"), cid)
		common.WriteJSON(w, http.StatusOK, result)
	}
}

func executeAPSWorkItem(ctx context.Context, body triggerWorkItemRequest) (triggerWorkItemResponse, int, error) {
	cfg := aps.LoadConfig()
	if err := cfg.Validate(); err != nil {
		return triggerWorkItemResponse{}, http.StatusServiceUnavailable, err
	}
	if strings.TrimSpace(cfg.InputObjectKey) == "" && strings.TrimSpace(body.InputObjectKey) == "" {
		return triggerWorkItemResponse{}, http.StatusServiceUnavailable, fmt.Errorf("APS_INPUT_OBJECT_KEY is required")
	}

	activityID := strings.TrimSpace(body.ActivityID)
	if activityID == "" {
		activityID = cfg.ActivityID
	}
	inputKey := strings.TrimSpace(body.InputObjectKey)
	if inputKey == "" {
		inputKey = cfg.InputObjectKey
	}
	outName := strings.TrimSpace(body.OutputFile)
	if outName == "" {
		outName = cfg.OutputFileName
	}

	presigner, err := aps.NewPresigner(ctx, cfg)
	if err != nil {
		return triggerWorkItemResponse{}, http.StatusBadGateway, err
	}

	inputPresign, err := presigner.PresignGetObjectURL(ctx, inputKey)
	if err != nil {
		return triggerWorkItemResponse{}, http.StatusBadGateway, err
	}
	outputKey := aps.NewOutputObjectKey(cfg.OutputKeyPrefix, outName)
	outputPresign, err := presigner.PresignPutObjectURL(ctx, outputKey)
	if err != nil {
		return triggerWorkItemResponse{}, http.StatusBadGateway, err
	}

	args := map[string]aps.WorkItemArgument{
		cfg.InputArgName: {
			URL:  inputPresign.URL,
			Verb: "get",
		},
	}
	payload := aps.BuildWorkItemRequest(activityID, cfg.OutputArgName, outputPresign.URL, args)

	client := aps.NewClient(cfg, nil)
	workItem, status, err := client.CreateWorkItem(ctx, payload)
	if err != nil {
		if status == 0 {
			status = http.StatusBadGateway
		}
		return triggerWorkItemResponse{
			Message: "APS WorkItem submit failed",
			Input:   inputPresign,
			Output:  outputPresign,
			Request: payload,
			WorkItem: workItem,
		}, status, err
	}

	workItemID, _ := workItem["id"].(string)
	resp := triggerWorkItemResponse{
		Message:  "APS WorkItem submitted",
		Input:    inputPresign,
		Output:   outputPresign,
		Request:  payload,
		WorkItem: workItem,
	}
	if workItemID == "" {
		return resp, status, nil
	}

	finalStatus, waitErr := client.WaitForWorkItem(ctx, workItemID, 4*time.Second, 12*time.Minute)
	resp.WorkItemStatus = finalStatus
	if waitErr != nil {
		resp.Message = "APS WorkItem polling failed"
		return resp, http.StatusBadGateway, waitErr
	}
	state, _ := finalStatus["status"].(string)
	if !strings.EqualFold(state, "success") {
		resp.Message = "APS WorkItem finished with status " + state
		return resp, http.StatusBadGateway, fmt.Errorf("aps workitem status=%s", state)
	}

	extracted, getErr := presigner.GetObjectJSON(ctx, outputKey)
	if getErr != nil {
		resp.Message = "APS WorkItem succeeded but result.json could not be read"
		return resp, http.StatusBadGateway, getErr
	}
	resp.ExtractedData = extracted
	resp.Message = "APS extraction completed"
	return resp, http.StatusOK, nil
}
