# Deep learning EC2 instance

This folder is used to setup an EC2 suitable for deep learning, as MacBook Pros are not very good at it.
Trying to run the `train/train.py` took 2 hours to go through 25 steps, on just 14 input images.

## Setup

1. Install terraform v0.13 or later
1. `cp example.tfvars terraform.tfvars`
1. Update `terraform.tfvars` with suitable variable values
1. `terraform init`
1. `terraform apply` -> yes
1. Successful apply should output an ssh command for you to use to get into your machine
1. After SSH'ing into the machine, setup the correct python env by running: `source activate tensorflow_p36`
1. Clone this repo

I recommend the [VSCode Remote extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) for developing/training on the EC2 instance.
Although the extension allows you to copy files from inside a local vscode instance, and paste it into the remote vscode instance, this can sometimes prove buggy/lossy with larger files like video files, so it's probably better to use SCP (e.g. `scp ./vid.mp4 ubuntu@EC2.IP.ADDR:/home/ubuntu` ) or copy/download through S3.