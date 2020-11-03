
resource "aws_s3_bucket" "www" {
  bucket = var.bucket_name
  acl    = "public-read"
  policy = data.aws_iam_policy_document.bucket_policy.json

  website {
    index_document = "index.html"
    error_document = "index.html"
  }

  tags = local.tags
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid = "AllowReadFromCloudfront"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "arn:aws:s3:::${var.bucket_name}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      variable = "aws:Referer"
      test     = "StringEquals"
      values   = [random_password.origin_custom_header.result]
    }
  }

  statement {
    sid    = "DenyReadFromNonCloudfront"
    effect = "Deny"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "arn:aws:s3:::${var.bucket_name}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      variable = "aws:Referer"
      test     = "StringNotEquals"
      values   = [random_password.origin_custom_header.result]
    }
  }
}