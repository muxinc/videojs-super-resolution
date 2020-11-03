# Custom header used to prevent direct access to S3 without going through Cloudfront
# while still allowing object-level redirects
# https://aws.amazon.com/premiumsupport/knowledge-center/cloudfront-serve-static-website/  (option #3)
resource random_password origin_custom_header {
  length           = 64
  override_special = "_-"
}

resource "aws_cloudfront_distribution" "www_distribution" {
  origin {
    custom_origin_config {
      http_port              = "80"
      https_port             = "443"
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    }
    custom_header {
      name  = "Referer"
      value = random_password.origin_custom_header.result
    }

    domain_name = aws_s3_bucket.www.website_endpoint

    origin_id = var.domain_name
  }

  price_class = "PriceClass_100"

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  default_cache_behavior {
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = var.domain_name
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
      headers = [
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }

  }

  aliases = [var.domain_name]

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2019"
  }
  tags = local.tags
}

output cloudfront_id {
  value = aws_cloudfront_distribution.www_distribution.id
}