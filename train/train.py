#!/usr/bin/env python3

import tensorflow as tf
import sys, os
import nn_model
import nn_utils
import random

scale_factor = 3
input_w = 1920
input_h = 1080

def create_dataset(filenames, h=1080, w=1920, scale_factor=3):
    dataset = tf.data.Dataset.from_tensor_slices(filenames)
    dataset = dataset.shuffle(10000)
    print(dataset)

    load_pngs = lambda params : nn_utils.load_pngs(h, w, scale_factor, params[0], params[1], params[2])

    dataset = dataset.map(load_pngs, 4)
    dataset = dataset.batch(10)
    print("dataset shape:", dataset)

    return dataset


def create_validation(filenames, h=1080, w=1920, scale_factor=3):
    dataset = tf.data.Dataset.from_tensor_slices(filenames)
    dataset = dataset.take(10)
    print(dataset)

    load_pngs = lambda params : nn_utils.load_pngs(h, w, scale_factor, params[0], params[1], params[2])
    dataset = dataset.map(load_pngs, 4)
    dataset = dataset.batch(10)
    print("dataset", dataset)
    return dataset


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: train.py name reference_dir scaled_dir low_res_dir")
        sys.exit(1)

    model_name = sys.argv[1]
    ref_dirname = sys.argv[2]
    scaled_dirname = sys.argv[3]
    low_res_dirname = sys.argv[4]

    scaler_model = nn_model.NNScaler(scale_factor)

    # Training
    filenames = nn_utils.load_filenames(ref_dirname, scaled_dirname, low_res_dirname)
    dataset = create_dataset(filenames, input_h, input_w, scale_factor)

    iterator = dataset.make_initializable_iterator()
    reference, scaled_img, low_res_img, ref_name, scaled_name, low_res_name = iterator.get_next()

    r = scaler_model.scaler_conv_net(low_res_img, scaled_img, False)
    mse = tf.reduce_mean(tf.square(r - reference))

    clipped_r = tf.clip_by_value(r, 0.0, 255.0)
    ssim = tf.image.ssim(reference, clipped_r, 255.0)
    ms_ssim = tf.image.ssim_multiscale(reference, clipped_r, 255.0)

    optimizer = tf.train.AdamOptimizer()
    training_op = optimizer.minimize((mse / 25.0) + (1.0 - ssim) + (1.0 - ms_ssim))

    # Validation
    random.seed(5)
    validation_filenames = nn_utils.load_validation(ref_dirname, scaled_dirname, low_res_dirname)
    print(validation_filenames)
    validation_set = create_validation(validation_filenames, input_h, input_w, scale_factor)

    validation_iterator = validation_set.make_initializable_iterator()
    validate_reference, validate_scaled, validate_low_res, ref_name, scaled_name, low_res_name = validation_iterator.get_next()

    validate_r = tf.clip_by_value(scaler_model.scaler_conv_net(validate_low_res, validate_scaled, True), 0.0, 255.0)
    validate_bilinear = validate_scaled

    psnr_validate = tf.image.psnr(validate_reference, validate_r, 255.0)
    ssim_validate = tf.image.ssim(validate_reference, validate_r, 255.0)
    ms_ssim_validate = tf.image.ssim_multiscale(validate_reference, validate_r, 255.0)

    psnr_linear = tf.image.psnr(validate_reference, validate_bilinear, 255.0)
    ssim_linear = tf.image.ssim(validate_reference, validate_bilinear, 255.0)
    ms_ssim_linear = tf.image.ssim_multiscale(validate_reference, validate_bilinear, 255.0)

    # Saver
    init = tf.global_variables_initializer()
    saver = tf.train.Saver()

    with tf.Session() as sess:
        init.run()
        # TODO: option for fresh training or more training
        #saver.restore(sess, "./{}_scaler_model.ckpt".format(model_name))

        for step in range(0, 100000):
            try:
                sess.run(training_op)
            except:
                print("Epoch finished!")
                sess.run(iterator.initializer)
                sess.run(training_op)

            if (step % 100) == 0:
                saver.save(sess, "./{}_scaler_model.ckpt".format(model_name))
                sess.run(validation_iterator.initializer)
                results = sess.run([psnr_validate, psnr_linear, ssim_validate, ssim_linear, ms_ssim_validate, ms_ssim_linear, ref_name, scaled_name, low_res_name])

                print(step)
                print("PSNR  SSIM  MS_SSIM")
                for i in range(len(results[0])):
                    print("{:0.2f} / {:0.2f} {:0.2f} / {:0.2f} {:0.2f} / {:0.2f}".format(results[0][i], results[1][i], results[2][i], results[3][i], results[4][i], results[5][i]))
