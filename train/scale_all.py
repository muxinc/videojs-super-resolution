#!/usr/bin/env python3
# Scale an image using super resolution
import sys, os
import tensorflow as tf
import nn_model
import nn_utils

scale_factor = 3
input_w = 1920
input_h = 1080

def load_pngs(height, width, scale_factor, scaled_name, low_res_name, output_name):
    scaled_img = nn_utils.load_png(scaled_name, height, width)
    low_res_img = nn_utils.load_png(low_res_name, height // scale_factor, width // scale_factor)

    return scaled_img, low_res_img, output_name

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: run.py model_name scaled_dir low_res_dir output_dir")
        sys.exit(1)

    model_name = sys.argv[1]
    scaled_dir = sys.argv[2]
    low_res_dir = sys.argv[3]
    output_dir = sys.argv[4]

    print("Scaling all files from {} and {} to {}".format(scaled_dir, low_res_dir, output_dir))

    filenames = nn_utils.load_filenames(scaled_dir, scaled_dir, low_res_dir)

    filenames = os.listdir(scaled_dir)
    filenames.sort()

    dataset_names = []
    for name in filenames:
        dataset_names.append((os.path.join(scaled_dir, name), os.path.join(low_res_dir, name), os.path.join(output_dir, name)))

    dataset = tf.data.Dataset.from_tensor_slices(dataset_names)
    map_func = lambda params : load_pngs(input_h, input_w, scale_factor, params[0], params[1], params[2])
    dataset = dataset.map(map_func, 5)
    dataset = dataset.batch(1)

    iterator = dataset.make_one_shot_iterator()
    scaled_img, low_res_img, output_name = iterator.get_next()

    scaler_model = nn_model.NNScaler(scale_factor)

    nn_result = scaler_model.scaler_conv_net(low_res_img, scaled_img, False)
    scaled_image = tf.squeeze(tf.cast(tf.clip_by_value(nn_result, 0.0, 255.0), tf.uint8))

    png_image = tf.image.encode_png(scaled_image)
    save_image = tf.write_file(tf.squeeze(output_name), png_image)
    
    saver = tf.train.Saver()

    with tf.Session() as sess:
        saver.restore(sess, "./{}_scaler_model.ckpt".format(model_name))

        while True:
            try:
                result = sess.run(save_image)
            except:
                break

print("Done")
