package homescool

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// dynamoTaskStore persists templates and assigned tasks in eduardoos_catalog
// (same PK/SK/data KV shape as teacher→student links).
//
//	homescool-tpl:t:{teacher}|id:{id}
//	homescool-task:t:{teacher}|s:{student}|id:{id}
//	homescool-task-by-student:s:{student}|t:{teacher}|id:{id}
type dynamoTaskStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoTaskStore) BackendName() string { return "dynamodb:" + d.table }

func templateSK(teacherEmail, id string) string {
	return "homescool-tpl:t:" + auth.NormalizeEmail(teacherEmail) + "|id:" + strings.TrimSpace(id)
}

func templateSKPrefix(teacherEmail string) string {
	return "homescool-tpl:t:" + auth.NormalizeEmail(teacherEmail) + "|id:"
}

func taskSK(teacherEmail, studentEmail, id string) string {
	return "homescool-task:t:" + auth.NormalizeEmail(teacherEmail) +
		"|s:" + auth.NormalizeEmail(studentEmail) + "|id:" + strings.TrimSpace(id)
}

func taskSKPrefix(teacherEmail, studentEmail string) string {
	return "homescool-task:t:" + auth.NormalizeEmail(teacherEmail) +
		"|s:" + auth.NormalizeEmail(studentEmail) + "|id:"
}

func taskByStudentSK(studentEmail, teacherEmail, id string) string {
	return "homescool-task-by-student:s:" + auth.NormalizeEmail(studentEmail) +
		"|t:" + auth.NormalizeEmail(teacherEmail) + "|id:" + strings.TrimSpace(id)
}

func taskByStudentSKPrefix(studentEmail string) string {
	return "homescool-task-by-student:s:" + auth.NormalizeEmail(studentEmail) + "|t:"
}

func (d *dynamoTaskStore) putJSON(ctx context.Context, sk string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item: map[string]types.AttributeValue{
			"PK":   &types.AttributeValueMemberS{Value: "APP"},
			"SK":   &types.AttributeValueMemberS{Value: sk},
			"data": &types.AttributeValueMemberS{Value: string(raw)},
		},
	})
	return err
}

func (d *dynamoTaskStore) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "APP"},
			"SK": &types.AttributeValueMemberS{Value: sk},
		},
	})
	if err != nil {
		return false, err
	}
	if out.Item == nil {
		return false, nil
	}
	data, ok := out.Item["data"].(*types.AttributeValueMemberS)
	if !ok || data.Value == "" {
		return false, nil
	}
	if err := json.Unmarshal([]byte(data.Value), dest); err != nil {
		return false, err
	}
	return true, nil
}

func (d *dynamoTaskStore) queryTemplates(ctx context.Context, skPrefix string) ([]TaskTemplate, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: skPrefix},
		},
	})
	if err != nil {
		return nil, err
	}
	items := make([]TaskTemplate, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var tpl TaskTemplate
		if err := json.Unmarshal([]byte(data.Value), &tpl); err != nil {
			continue
		}
		items = append(items, cloneTemplate(tpl))
	}
	return items, nil
}

func (d *dynamoTaskStore) queryTasks(ctx context.Context, skPrefix string) ([]AssignedTask, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: skPrefix},
		},
	})
	if err != nil {
		return nil, err
	}
	items := make([]AssignedTask, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var task AssignedTask
		if err := json.Unmarshal([]byte(data.Value), &task); err != nil {
			continue
		}
		items = append(items, cloneTask(task))
	}
	return items, nil
}

func (d *dynamoTaskStore) CreateTemplate(ctx context.Context, tpl TaskTemplate) (TaskTemplate, error) {
	tpl.TeacherEmail = auth.NormalizeEmail(tpl.TeacherEmail)
	tpl.Name = strings.TrimSpace(tpl.Name)
	if tpl.TeacherEmail == "" || tpl.Name == "" {
		return TaskTemplate{}, fmt.Errorf("teacherEmail and name required")
	}
	if tpl.ID == "" {
		tpl.ID = uuid.NewString()
	}
	tpl.MaxScore = NormalizeMaxScore(tpl.MaxScore)
	now := auth.NowRFC3339()
	if tpl.CreatedAt == "" {
		tpl.CreatedAt = now
	}
	tpl.UpdatedAt = now
	if err := d.putJSON(ctx, templateSK(tpl.TeacherEmail, tpl.ID), tpl); err != nil {
		return TaskTemplate{}, err
	}
	return cloneTemplate(tpl), nil
}

func (d *dynamoTaskStore) UpdateTemplate(ctx context.Context, tpl TaskTemplate) (TaskTemplate, error) {
	existing, ok, err := d.GetTemplate(ctx, tpl.TeacherEmail, tpl.ID)
	if err != nil {
		return TaskTemplate{}, err
	}
	if !ok {
		return TaskTemplate{}, fmt.Errorf("template not found")
	}
	tpl.TeacherEmail = auth.NormalizeEmail(tpl.TeacherEmail)
	tpl.CreatedAt = existing.CreatedAt
	tpl.MaxScore = NormalizeMaxScore(tpl.MaxScore)
	tpl.UpdatedAt = auth.NowRFC3339()
	if err := d.putJSON(ctx, templateSK(tpl.TeacherEmail, tpl.ID), tpl); err != nil {
		return TaskTemplate{}, err
	}
	return cloneTemplate(tpl), nil
}

func (d *dynamoTaskStore) GetTemplate(ctx context.Context, teacherEmail, id string) (TaskTemplate, bool, error) {
	var tpl TaskTemplate
	ok, err := d.getJSON(ctx, templateSK(teacherEmail, id), &tpl)
	if err != nil || !ok {
		return TaskTemplate{}, ok, err
	}
	return cloneTemplate(tpl), true, nil
}

func (d *dynamoTaskStore) ListTemplates(ctx context.Context, teacherEmail, period, studyArea string) ([]TaskTemplate, error) {
	items, err := d.queryTemplates(ctx, templateSKPrefix(teacherEmail))
	if err != nil {
		return nil, err
	}
	period = strings.TrimSpace(period)
	studyArea = strings.TrimSpace(studyArea)
	if period == "" && studyArea == "" {
		return items, nil
	}
	out := make([]TaskTemplate, 0, len(items))
	for _, tpl := range items {
		if period != "" && !strings.EqualFold(tpl.Period, period) {
			continue
		}
		if studyArea != "" && !strings.EqualFold(tpl.StudyArea, studyArea) {
			continue
		}
		out = append(out, tpl)
	}
	return out, nil
}

func (d *dynamoTaskStore) CreateTask(ctx context.Context, task AssignedTask) (AssignedTask, error) {
	task.TeacherEmail = auth.NormalizeEmail(task.TeacherEmail)
	task.StudentEmail = auth.NormalizeEmail(task.StudentEmail)
	task.Name = strings.TrimSpace(task.Name)
	if task.TeacherEmail == "" || task.StudentEmail == "" || task.Name == "" {
		return AssignedTask{}, fmt.Errorf("teacher, student, and name required")
	}
	if task.ID == "" {
		task.ID = uuid.NewString()
	}
	task.StudentSlug = StudentSlug(task.StudentEmail)
	task.MaxScore = NormalizeMaxScore(task.MaxScore)
	if task.Status == "" {
		task.Status = TaskStatusPending
	}
	if !IsValidTaskStatus(task.Status) {
		return AssignedTask{}, fmt.Errorf("invalid status")
	}
	now := auth.NowRFC3339()
	if task.CreatedAt == "" {
		task.CreatedAt = now
	}
	task.UpdatedAt = now
	if err := d.putJSON(ctx, taskSK(task.TeacherEmail, task.StudentEmail, task.ID), task); err != nil {
		return AssignedTask{}, err
	}
	if err := d.putJSON(ctx, taskByStudentSK(task.StudentEmail, task.TeacherEmail, task.ID), task); err != nil {
		return AssignedTask{}, err
	}
	return cloneTask(task), nil
}

func (d *dynamoTaskStore) UpdateTask(ctx context.Context, task AssignedTask) (AssignedTask, error) {
	existing, ok, err := d.GetTask(ctx, task.TeacherEmail, task.StudentEmail, task.ID)
	if err != nil {
		return AssignedTask{}, err
	}
	if !ok {
		return AssignedTask{}, fmt.Errorf("task not found")
	}
	task.TeacherEmail = auth.NormalizeEmail(task.TeacherEmail)
	task.StudentEmail = auth.NormalizeEmail(task.StudentEmail)
	task.CreatedAt = existing.CreatedAt
	task.StudentSlug = StudentSlug(task.StudentEmail)
	task.MaxScore = NormalizeMaxScore(task.MaxScore)
	if !IsValidTaskStatus(task.Status) {
		return AssignedTask{}, fmt.Errorf("invalid status")
	}
	task.UpdatedAt = auth.NowRFC3339()
	if err := d.putJSON(ctx, taskSK(task.TeacherEmail, task.StudentEmail, task.ID), task); err != nil {
		return AssignedTask{}, err
	}
	if err := d.putJSON(ctx, taskByStudentSK(task.StudentEmail, task.TeacherEmail, task.ID), task); err != nil {
		return AssignedTask{}, err
	}
	return cloneTask(task), nil
}

func (d *dynamoTaskStore) GetTask(ctx context.Context, teacherEmail, studentEmail, id string) (AssignedTask, bool, error) {
	var task AssignedTask
	ok, err := d.getJSON(ctx, taskSK(teacherEmail, studentEmail, id), &task)
	if err != nil || !ok {
		return AssignedTask{}, ok, err
	}
	return cloneTask(task), true, nil
}

func (d *dynamoTaskStore) ListTasksByTeacherStudent(ctx context.Context, teacherEmail, studentEmail string) ([]AssignedTask, error) {
	return d.queryTasks(ctx, taskSKPrefix(teacherEmail, studentEmail))
}

func (d *dynamoTaskStore) ListTasksByStudent(ctx context.Context, studentEmail string) ([]AssignedTask, error) {
	return d.queryTasks(ctx, taskByStudentSKPrefix(studentEmail))
}

func newDynamoTaskStore(ctx context.Context) (*dynamoTaskStore, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	prefix := httpx.Env("DYNAMODB_TABLE_PREFIX", "eduardoos")
	table := httpx.Env("HOMESCOOL_TABLE", prefix+"_catalog")
	if table == "" {
		return nil, fmt.Errorf("HOMESCOOL_TABLE is empty")
	}
	return &dynamoTaskStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

// OpenTaskStore selects memory or DynamoDB for templates and assigned tasks.
// Uses the same backend resolution as OpenLinkStore so links and tasks stay aligned.
func OpenTaskStore(ctx context.Context) TaskStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("HOMESCOOL_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("homescool task store backend=memory")
		return NewMemoryTaskStore()
	}
	store, err := newDynamoTaskStore(ctx)
	if err != nil {
		log.Printf("homescool task store dynamodb unavailable (%v); falling back to memory", err)
		return NewMemoryTaskStore()
	}
	log.Printf("homescool task store backend=dynamodb table=%s", store.table)
	return store
}
