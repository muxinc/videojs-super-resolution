# videojs-super-resolution

Super resolution is super!

## Local development

```sh
# Set NPM version
nvm use

npm install
npm start
# Demo available at http://localhost:9999
```

## Installation

```sh
npm install --save @mux/videojs-super-resolution
```

## Usage

To include videojs-super-resolution on your website or web application, use any of the following methods.

### `<script>` Tag

This is the simplest case. Get the script in whatever way you prefer and include the plugin _after_ you include [video.js][videojs], so that the `videojs` global is available.

```html
<script src="//path/to/video.min.js"></script>
<script src="//path/to/videojs-super-resolution.min.js"></script>
<script>
  var player = videojs('my-video');

  player.superResolution();
</script>
```

### Browserify/CommonJS

When using with Browserify, install videojs-super-resolution via npm and `require` the plugin as you would any other module.

```js
var videojs = require('video.js');

// The actual plugin function is exported by this module, but it is also
// attached to the `Player.prototype`; so, there is no need to assign it
// to a variable.
require('@videojs-super-resolution/videojs-super-resolution');

var player = videojs('my-video');

player.superResolution();
```

### RequireJS/AMD

When using with RequireJS (or another AMD library), get the script in whatever way you prefer and `require` the plugin as you normally would:

```js
require([
  'video.js',
  '@videojs-super-resolution/videojs-super-resolution'
], function(videojs) {
  var player = videojs('my-video');

  player.superResolution();
});
```

## License

MIT. Copyright (c) Matthew McClure &lt;m@mmcc.io&gt;

[videojs]: http://videojs.com/
