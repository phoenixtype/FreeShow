// Bokeh. C0 top, C1 bottom, C2..C4 lights. P: count, size, brightness, drift (+1 up, -1 down, 0 float).
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    float asp = R.x / R.y;
    int n = int(P.x);
    for (int i = 0; i < 160; i++) {
        if (i >= n) break;
        float fi = float(i);
        vec3 h = hash33(vec3(fi, fi * 1.37, 4.1));
        vec3 g = hash33(vec3(fi * 2.3, 9.1, fi));
        float depth = h.z;
        float r = P.y * (.02 + .09 * depth * depth);
        float k = 1. + floor(g.x * 2.);
        float x = (h.x - .5) * asp * 1.15 + .03 * sin(PH + fi);
        float y = (fract(h.y + P.w * T * k) - .5) * 1.3 + .02 * cos(PH + fi * 2.1);
        float d = length(p - vec2(x, y));
        float disk = 1. - smoothstep(r * (.92 - .45 * depth), r, d);
        float ring = smoothstep(r * .7, r * .97, d) * disk;
        float tw = .65 + .35 * sin(PH * k + fi * 4.7);
        col += pick3(g.y, 2) * (disk * .5 + ring * .3) * mix(.25, 1., depth) * tw * P.z;
    }
    return col;
}
