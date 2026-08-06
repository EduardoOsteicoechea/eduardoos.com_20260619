package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/aps"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

type triggerWorkItemRequest struct {
	ActivityID     string `json:"activityId,omitempty"`
	InputObjectKey string `json:"inputObjectKey,omitempty"`
	OutputFile     string `json:"outputFileName,omitempty"`
}

type triggerWorkItemResponse struct {
	Message         string              `json:"message"`
	CorrelationID   string              `json:"correlationId"`
	WorkItemID      string              `json:"workItemId,omitempty"`
	OutputObjectKey string              `json:"outputObjectKey,omitempty"`
	Input           aps.PresignResult   `json:"input"`
	Output          aps.PresignResult   `json:"output"`
	WorkItem        map[string]any      `json:"workItem"`
	WorkItemStatus  map[string]any      `json:"workItemStatus,omitempty"`
	ExtractedData   map[string]any      `json:"extractedData,omitempty"`
	Request         aps.WorkItemRequest `json:"request"`
}

type workItemStatusResponse struct {
	Message         string         `json:"message"`
	CorrelationID   string         `json:"correlationId"`
	WorkItemID      string         `json:"workItemId"`
	OutputObjectKey string         `json:"outputObjectKey,omitempty"`
	Status          string         `json:"status"`
	Done            bool           `json:"done"`
	WorkItemStatus  map[string]any `json:"workItemStatus,omitempty"`
	ExtractedData   map[string]any `json:"extractedData,omitempty"`
}

func registerAPSRoutes(r chi.Router, cfg config) {
	r.Post("/api/aps/trigger-workitem", cfg.triggerAPSWorkItem())
	r.Get("/api/aps/workitems/{id}", cfg.getAPSWorkItemStatus())
}

func (c config) requireAPSAdmin(w http.ResponseWriter, r *http.Request, event string) (email string, cid string, ok bool) {
	cid = common.CorrelationFromRequest(r)
	c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "started"), cid)
	email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
	if err != nil {
		logs := []string{event + ": JWT subject extraction failed", event + ": error=" + err.Error()}
		log.Printf("[correlation=%s] %s auth failed: %v", cid, event, err)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		common.WriteErrorWithDebug(w, http.StatusUnauthorized, err.Error(), cid, logs)
		return "", cid, false
	}
	if !aps.IsAdminEmail(email) {
		logs := []string{event + ": caller is not the APS admin allowlist email", event + ": email=" + email}
		log.Printf("[correlation=%s] %s forbidden email=%s", cid, event, email)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		common.WriteErrorWithDebug(w, http.StatusForbidden, "forbidden", cid, logs)
		return "", cid, false
	}
	return email, cid, true
}

func (c config) triggerAPSWorkItem() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, cid, ok := c.requireAPSAdmin(w, r, "aps.trigger-workitem")
		if !ok {
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

		result, status, err := submitAPSWorkItem(r.Context(), body)
		if err != nil {
			logs := []string{
				"aps.trigger-workitem: submit failed",
				"aps.trigger-workitem: error=" + err.Error(),
			}
			log.Printf("[correlation=%s] aps.trigger-workitem failed: %v", cid, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "error"), cid)
			if status == 0 || status < 400 {
				status = http.StatusBadGateway
			}
			common.WriteErrorWithDebug(w, status, err.Error(), cid, logs)
			return
		}

		result.CorrelationID = cid
		result.Message = "APS WorkItem submitted; poll GET /api/aps/workitems/{id}"
		log.Printf("[correlation=%s] aps.trigger-workitem submitted id=%s outputKey=%s", cid, result.WorkItemID, result.OutputObjectKey)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.trigger-workitem", "success"), cid)
		common.WriteJSON(w, http.StatusAccepted, result)
	}
}

func (c config) getAPSWorkItemStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, cid, ok := c.requireAPSAdmin(w, r, "aps.workitem.status")
		if !ok {
			return
		}

		workItemID := strings.TrimSpace(chi.URLParam(r, "id"))
		outputKey := strings.TrimSpace(r.URL.Query().Get("outputObjectKey"))
		if workItemID == "" {
			common.WriteError(w, http.StatusBadRequest, "work item id required")
			return
		}

		result, status, err := pollAPSWorkItem(r.Context(), workItemID, outputKey)
		result.CorrelationID = cid
		if err != nil {
			logs := []string{
				"aps.workitem.status: failed",
				"aps.workitem.status: error=" + err.Error(),
			}
			if result.WorkItemStatus != nil {
				if reportURL, ok := result.WorkItemStatus["reportUrl"].(string); ok && reportURL != "" {
					logs = append(logs, "aps.workitem.status: reportUrl="+reportURL)
				}
			}
			if result.ExtractedData != nil {
				if reportText, ok := result.ExtractedData["reportText"].(string); ok && reportText != "" {
					const maxReport = 12000
					if len(reportText) > maxReport {
						reportText = reportText[:maxReport] + "\n...[truncated]"
					}
					logs = append(logs, "aps.workitem.status: reportText=\n"+reportText)
				}
			}
			log.Printf("[correlation=%s] aps.workitem.status failed id=%s: %v", cid, workItemID, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.workitem.status", "error"), cid)
			if status == 0 || status < 400 {
				status = http.StatusBadGateway
			}
			common.WriteErrorWithDebug(w, status, err.Error(), cid, logs)
			return
		}

		log.Printf("[correlation=%s] aps.workitem.status id=%s status=%s done=%v", cid, workItemID, result.Status, result.Done)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "aps.workitem.status", "success"), cid)
		common.WriteJSON(w, http.StatusOK, result)
	}
}

func submitAPSWorkItem(ctx context.Context, body triggerWorkItemRequest) (triggerWorkItemResponse, int, error) {
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
			Message:         "APS WorkItem submit failed",
			OutputObjectKey: outputKey,
			Input:           inputPresign,
			Output:          outputPresign,
			Request:         payload,
			WorkItem:        workItem,
		}, status, err
	}

	workItemID, _ := workItem["id"].(string)
	return triggerWorkItemResponse{
		Message:         "APS WorkItem submitted",
		WorkItemID:      workItemID,
		OutputObjectKey: outputKey,
		Input:           inputPresign,
		Output:          outputPresign,
		Request:         payload,
		WorkItem:        workItem,
	}, http.StatusAccepted, nil
}

func pollAPSWorkItem(ctx context.Context, workItemID, outputKey string) (workItemStatusResponse, int, error) {
	cfg := aps.LoadConfig()
	if err := cfg.Validate(); err != nil {
		return workItemStatusResponse{}, http.StatusServiceUnavailable, err
	}

	client := aps.NewClient(cfg, nil)
	statusMap, httpStatus, err := client.GetWorkItemStatus(ctx, workItemID)
	if err != nil {
		if httpStatus == 0 {
			httpStatus = http.StatusBadGateway
		}
		return workItemStatusResponse{
			WorkItemID:      workItemID,
			OutputObjectKey: outputKey,
			WorkItemStatus:  statusMap,
		}, httpStatus, err
	}

	state, _ := statusMap["status"].(string)
	stateLower := strings.ToLower(strings.TrimSpace(state))
	resp := workItemStatusResponse{
		Message:         "APS WorkItem status",
		WorkItemID:      workItemID,
		OutputObjectKey: outputKey,
		Status:          stateLower,
		Done:            false,
		WorkItemStatus:  statusMap,
	}

	switch stateLower {
	case "pending", "inprogress":
		resp.Message = "APS WorkItem still running"
		return resp, http.StatusOK, nil
	case "success":
		resp.Done = true
		if strings.TrimSpace(outputKey) == "" {
			resp.Message = "APS WorkItem succeeded; outputObjectKey query param required to load result.json"
			return resp, http.StatusOK, nil
		}
		presigner, perr := aps.NewPresigner(ctx, cfg)
		if perr != nil {
			return resp, http.StatusBadGateway, perr
		}
		extracted, getErr := presigner.GetObjectJSON(ctx, outputKey)
		if getErr != nil {
			resp.Message = "APS WorkItem succeeded but result.json could not be read"
			return resp, http.StatusBadGateway, getErr
		}
		resp.ExtractedData = extracted
		resp.Message = "APS extraction completed"
		return resp, http.StatusOK, nil
	case "failed", "cancelled", "failedlimitprocessingtime", "faileddownload", "failedinstructions", "failedupload":
		resp.Done = true
		resp.Message = "APS WorkItem finished with status " + stateLower
		if reportURL, ok := statusMap["reportUrl"].(string); ok && strings.TrimSpace(reportURL) != "" {
			if reportText, reportErr := fetchURLText(ctx, reportURL); reportErr == nil {
				resp.ExtractedData = map[string]any{"reportText": reportText}
			}
		}
		return resp, http.StatusBadGateway, fmt.Errorf("aps workitem status=%s", stateLower)
	default:
		resp.Message = "APS WorkItem status=" + stateLower
		return resp, http.StatusOK, nil
	}
}

func fetchURLText(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return "", err
	}
	return string(body), nil
}
