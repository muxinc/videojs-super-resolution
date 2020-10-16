# Utils for nn scaler

import tensorflow as tf
import os
import random

# Load a PNG and scale it to the given width/height
def load_png(filename, height, width):
    raw_png = tf.read_file(filename)
    decoded_png = tf.image.decode_png(raw_png, channels=3)
    scaled_png = tf.image.resize_images(decoded_png, [height, width], method=tf.image.ResizeMethod.BILINEAR, align_corners=True)
    return scaled_png

# Load 2 pngs, one reference one scaled.
def load_pngs(h, w, scale_factor, reference_name, scaled_name, low_res_name):
    reference_img = load_png(reference_name, h, w)
    scaled_img = load_png(scaled_name, h, w)
    low_res_img = load_png(low_res_name, h // scale_factor, w // scale_factor)

    return reference_img, scaled_img, low_res_img, reference_name, scaled_name, low_res_name


def load_filenames(ref_dirname, scaled_dirname, low_res_dirname):
    filenames = []
    for name in os.listdir(ref_dirname):
        filenames.append((os.path.join(ref_dirname, name), os.path.join(scaled_dirname, name), os.path.join(low_res_dirname, name)))

    return filenames

def load_validation(ref_dirname, scaled_dirname, low_res_dirname):
    filenames = []
    names = os.listdir(ref_dirname)
    for name in random.sample(names, 10):
        filenames.append((os.path.join(ref_dirname, name), os.path.join(scaled_dirname, name), os.path.join(low_res_dirname, name)))

    return filenames