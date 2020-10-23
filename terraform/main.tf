terraform {
  required_version = ">= 0.13.1"
  required_providers {
    http = "~> 2.0.0"
  }
}

provider "aws" {
  version = ">= 3.0"
  region  = "us-east-1"
}

variable vpc_id {}
variable username {
  description = "Your name, used to name resources in case multiple people have set up these resources"
}
variable ssh_public_key_file {
  description = "Point to the public key for the ssh key you want to use"
}

locals {
  tags = {
    client = "REDSpace"
    project = "EvolvingSkillsProgram"
    Name = "SuperResolution_${var.username}"
  }
  my_ip = chomp(data.http.my_ip.body)
}

data "http" "my_ip" {
  url = "https://ipv4.icanhazip.com"
}

resource "aws_instance" "super_res" {
  ami           = "ami-01aad86525617098d"
  instance_type = "g3s.xlarge"

  key_name = aws_key_pair.login.key_name

  associate_public_ip_address = true
  vpc_security_group_ids = [aws_security_group.super_res.id]

  root_block_device {
    volume_type = "gp2"
    volume_size = "100"
  }

  tags = local.tags
  volume_tags = local.tags
}

resource "aws_key_pair" "login" {
  key_name_prefix   = "super_resolution_${var.username}_"
  public_key = file(var.ssh_public_key_file)

  tags = local.tags
}

resource aws_security_group super_res {
  name_prefix = "super_resolution_${var.username}_"
  description = "Allow ssh in and all egress"
  vpc_id      = var.vpc_id

  tags = local.tags
}

resource aws_security_group_rule allow_outbound {
  description = "Allow all traffic out"

  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.super_res.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource aws_security_group_rule allow_ssh_in {
  description = "Allow ssh in from personal computer"

  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  security_group_id = aws_security_group.super_res.id
  cidr_blocks       = ["${local.my_ip}/32"]
}

output ssh_command {
  value = "ssh -i ${trimsuffix(var.ssh_public_key_file, ".pub")} ubuntu@${aws_instance.super_res.public_ip}"
}