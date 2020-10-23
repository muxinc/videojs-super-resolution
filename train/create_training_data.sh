#!/bin/bash
# Takes a 1080p video and generates 3 folders of images to be used for training

set -e

if [ "$#" != 1 ]; then
  echo "Usage: $0 input_video_1080p.mp4"
  exit 1
fi

INPUT_VIDEO=$1

BASE=`basename $INPUT_VIDEO`
VIDEO_EXT="${BASE##*.}"
OUTPUT_DIR="${BASE%.*}"
REF_DIR=${OUTPUT_DIR}/reference_dir
LOW_RES_DIR=${OUTPUT_DIR}/low_res_dir
SCALED_DIR=${OUTPUT_DIR}/scaled_dir

FULL_RES="1920:1080"
LOW_RES="640:360"

mkdir -p ${REF_DIR} ${LOW_RES_DIR} ${SCALED_DIR}

# Hide excessive output, and overwrite existing files
DEFAULT_FLAGS="-hide_banner -loglevel warning -y"

echo "Splitting video into images..."

# Split input_video into pngs, labelled 0001.png, 0002.png etc, where -r 1 specifies 1 frame per second
ffmpeg ${DEFAULT_FLAGS} -i ${INPUT_VIDEO} -r 1 ${REF_DIR}/%04d.png

echo "Downscaling images..."

# Scale down input pngs bicubicly into LOW_RES_DIR
for input_file in ${REF_DIR}/* ; do
  base=`basename ${input_file}`
  ffmpeg ${DEFAULT_FLAGS} -i ${input_file} -vf scale=${LOW_RES} -sws_flags bicubic ${LOW_RES_DIR}/${base}
done

echo "Upscaling low-res images..."

# Scale back up bilinearly into SCALED_DIR
for input_file in ${LOW_RES_DIR}/* ; do
  base=`basename ${input_file}`
  ffmpeg ${DEFAULT_FLAGS} -i ${input_file} -vf scale=${FULL_RES} -sws_flags bilinear ${SCALED_DIR}/${base}
done

echo "Downscaling video for demo playback..."

# This video will be served on the demo html page to be upscaled in real time
X_LOW_RES=`echo ${LOW_RES} | tr ':' 'x'`
ffmpeg ${DEFAULT_FLAGS} -i ${INPUT_VIDEO} -vf scale=${LOW_RES} "${OUTPUT_DIR}/${OUTPUT_DIR}_${X_LOW_RES}.${VIDEO_EXT}"
