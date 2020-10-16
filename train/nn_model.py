# 3x super resolution model
import tensorflow as tf
import json

class NNScaler:
    def __init__(self, scale_factor):
        self.scale_factor = scale_factor

        self.layer_1_size = 5
        self.layer_1_depth = 16

        self.layer_2_size = 3
        self.layer_2_depth = 8

        self.reconstruct_size = 3


    def get_padding(self):
        return (self.layer_1_size // 2) + (self.layer_2_size // 2) + (self.reconstruct_size // 2)


    def dump_weights(self):
        scale_vars = {
            "W_conv1_1": self.W_conv1_1.eval().tolist(),
            "W_conv1_2": self.W_conv1_2.eval().tolist(),
            "b_conv1": self.b_conv1.eval().tolist(),
            "W_conv2_1": self.W_conv2_1.eval().tolist(),
            "W_conv2_2": self.W_conv2_2.eval().tolist(),
            "b_conv2": self.b_conv2.eval().tolist(),
            "W_reconstruct": self.W_reconstruct.eval().tolist(),
            "b_reconstruct": self.b_reconstruct.eval().tolist()
        }

        print(json.dumps(scale_vars, indent=2, sort_keys=True))


    # input_tensor: rgb uint8 image
    # returns: rgb uint8 image
    def scaler_conv_net(self, input_image, scaled_image, reuse):
        with tf.variable_scope("scale_net", reuse=reuse):
            # Massage the inputs
            padding = self.get_padding()
            self.input_padded = tf.pad(input_image, [[0, 0], [padding, padding], [padding, padding], [0, 0]])

            # Layer 1
            self.W_conv1_1 = tf.get_variable("W_conv1_1", [self.layer_1_size, 1, 3, self.layer_1_depth], initializer=tf.truncated_normal_initializer(stddev=0.01))
            self.W_conv1_2 = tf.get_variable("W_conv1_2", [1, self.layer_1_size, self.layer_1_depth, self.layer_1_depth], initializer=tf.truncated_normal_initializer(stddev=0.01))
            self.b_conv1 = tf.get_variable("b_conv1", [self.layer_1_depth], initializer=tf.zeros_initializer)
            self.conv1_1 = tf.nn.conv2d(self.input_padded, self.W_conv1_1, strides=[1, 1, 1, 1], padding="VALID")
            self.conv1 = tf.nn.relu(tf.nn.conv2d(self.conv1_1, self.W_conv1_2, strides=[1, 1, 1, 1], padding="VALID") + self.b_conv1)
            
            print("conv1_1 shape: ", self.conv1_1.shape)
            print("conv1 shape: ", self.conv1.shape)

            # Layer 2
            self.W_conv2_1 = tf.get_variable("W_conv2_1", [self.layer_2_size, 1, self.layer_1_depth, self.layer_2_depth], initializer=tf.truncated_normal_initializer(stddev=0.01))
            self.W_conv2_2 = tf.get_variable("W_conv2_2", [1, self.layer_2_size, self.layer_2_depth, self.layer_2_depth], initializer=tf.truncated_normal_initializer(stddev=0.01))
            self.b_conv2 = tf.get_variable("b_conv2", [self.layer_2_depth], initializer=tf.zeros_initializer)
            self.conv2_1 = tf.nn.conv2d(self.conv1, self.W_conv2_1, strides=[1, 1, 1, 1], padding="VALID")
            self.conv2 = tf.nn.relu(tf.nn.conv2d(self.conv2_1, self.W_conv2_2, strides=[1, 1, 1, 1], padding="VALID") + self.b_conv2)

            # Reconstruct
            reconstruct_depth = self.scale_factor * self.scale_factor * 3
            self.W_reconstruct = tf.get_variable("W_reconstruct", [self.reconstruct_size, self.reconstruct_size, self.layer_2_depth, reconstruct_depth])
            self.b_reconstruct = tf.get_variable("b_convR", [3 * self.scale_factor * self.scale_factor], initializer=tf.truncated_normal_initializer(stddev=0.01))
            reconstruct_raw = tf.nn.conv2d(self.conv2, self.W_reconstruct, strides=[1,1,1,1], padding="VALID") + self.b_reconstruct
            self.reconstruct = scaled_image + tf.depth_to_space(reconstruct_raw, self.scale_factor)
            

            return self.reconstruct
