terraform {
  required_version = ">= 0.13.1"
  required_providers {
    aws     = ">= 3.0"
    random  = "~> 3.0"
  }
}

provider "aws" {
  region  = "ca-central-1"
}

variable domain_name {
  type        = string
  description = "The site domain name"
}

variable bucket_name {
  type        = string
  description = "The name of the bucket to be created"
}

variable parent_zone_id {
  type        = string
  description = "The zone id of the parent zone"
}

variable acm_certificate_arn {
  type        = string
  description = "Arn of the ssl certificate to be imported"
}

locals {
  tags = {
    client = "redspace"
    project = "evolving-skills-program"
    Name = "SuperResolution"
  }
}