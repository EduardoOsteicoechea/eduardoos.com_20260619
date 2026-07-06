package s3store

import "strings"

// HumanizeAccessError turns AWS SDK errors into short operator-facing messages.
func HumanizeAccessError(raw string) string {
	lower := strings.ToLower(raw)
	if strings.Contains(lower, "accessdenied") || strings.Contains(lower, "not authorized") {
		if strings.Contains(lower, "listbucket") {
			return "S3 access denied: attach deploy/aws/ec2-iam-policy.json to role eduardoos-ec2-s3-role (requires s3:ListBucket on eduardoos20260607)."
		}
		if strings.Contains(lower, "putobject") || strings.Contains(lower, "getobject") {
			return "S3 access denied: attach deploy/aws/ec2-iam-policy.json to role eduardoos-ec2-s3-role (requires s3:PutObject and s3:GetObject on eduardoos20260607/*)."
		}
		return "S3 access denied: attach deploy/aws/ec2-iam-policy.json to the EC2 instance role eduardoos-ec2-s3-role."
	}
	return raw
}
