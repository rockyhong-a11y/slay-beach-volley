// Generated from the exact Blender camera; homogeneous engine-coordinate pixel projection.
// Divide rows 0 and 1 by row 2; then scale pixels by canvasWidth/960, canvasHeight/1440.
export const COURT_SCENE = {
  "id": "slay-stadium-v1",
  "width": 960,
  "height": 1440,
  "projection": [
    [
      15.786665081977844,
      -4.396872818470001,
      -3.685046508908272,
      9013.489379882812
    ],
    [
      0.0,
      12.523569166660309,
      -19.850858263671398,
      15036.038360595703
    ],
    [
      0.0,
      -0.009160151705145836,
      -0.007677180226892233,
      35.2225456237793
    ]
  ],
  "referenceDepth": 29.726454600691795,
  "netHeight": 230,
  "corners": [
    [
      255.9011,
      426.8868
    ],
    [
      704.0989,
      426.8868
    ],
    [
      805.762,
      1240.7705
    ],
    [
      154.238,
      1240.7705
    ]
  ],
  "netTop": [
    [
      197.6991,
      643.2057
    ],
    [
      762.3009,
      643.2057
    ]
  ],
  "courts": [
    {
      "background": "../assets/courts/coral.webp",
      "net": "../assets/courts/coral-net.webp"
    },
    {
      "background": "../assets/courts/sunset.webp",
      "net": "../assets/courts/sunset-net.webp"
    },
    {
      "background": "../assets/courts/moonlight.webp",
      "net": "../assets/courts/moonlight-net.webp"
    }
  ]
};
