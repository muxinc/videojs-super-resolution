This folder is used to setup an EC2 suitable for deep learning, as MacBook Pros are not very good at it.
Trying to run the `train/train.py` took 2 hours to go through 25 epochs, on just 14 input images.

# Setup

1. Install terraform v0.13 or later
1. `cp example.tfvars terraform.tfvars`
1. Update `terraform.tfvars` with suitable variable values
1. `terraform init`
1. `terraform apply` -> yes
1. Successful apply should output an ssh command for you to use to get into your machine
