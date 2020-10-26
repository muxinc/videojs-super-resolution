# Steps to train new model and produce weights for a video

The scripts are currently setup to work for 1080p input video, scaling 3x to output 360p video and the super resolution weights to apply to that 360p video.

1. If your machine does not have the necessary GPU power to train models (i.e. don't try to train on a MacBook Pro), checkout the [terraform folder README](../terraform/README.md) to spin up a suitable machine, and follow the python env setup instructions as well
    - If not using an EC2 machine, install the python dependencies in `/requirements.txt`
1. With an input 1080p video (e.g. my_vid.mp4), create data:

    ```sh
    ./create_training_data.sh my_vid.mp4
    ```

    This should create 3 folders of data:

    `my_vid/reference` contains the input, cut into multiple pngs

    `my_vid/low_res` contains images scaled down bicubicly to 360p using ffmpeg

    `my_vid/scaled` contains those 360p versions, scaled back up bilinearly using ffmpeg

1. Train your model. You can also input a higher number of steps (like 100000), and if training is taking too long, you should be able to interrupt with `ctrl-c` and the program should handle it gracefully, outputting the currently trained weights.

    ```sh
    ./train.py ./my_vid 1000
    ```

    Trained weights for your video should be output to `my_vid_weights.js`