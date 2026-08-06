export function humanizeS3Error(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes("accessdenied") || lower.includes("not authorized")) {
        if (lower.includes("listbucket")) {
            return "S3 access denied — run deploy/aws/ensure-ec2-iam-policy.sh (role eduardoos-ec2-s3-role needs s3:ListBucket on eduardoos20260607).";
        }
        if (lower.includes("putobject") || lower.includes("getobject")) {
            return "S3 access denied — run deploy/aws/ensure-ec2-iam-policy.sh (role eduardoos-ec2-s3-role needs s3:PutObject and s3:GetObject on eduardoos20260607/*).";
        }
        return "S3 access denied — attach deploy/aws/ec2-iam-policy.json to the EC2 role eduardoos-ec2-s3-role.";
    }
    return message;
}
