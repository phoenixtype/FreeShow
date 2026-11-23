// Snowfall. C0 top, C1 bottom, C2 flakes, C3 background lights. P: layers, flake size, lights, wind.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    if (P.z > 0.) {
        for (int i = 0; i < 40; i++) {
            float fi = float(i);
            vec3 h = hash33(vec3(fi, 2., 5.));
            float r = .03 + .06 * h.z;
            float d = length(p - vec2((h.x - .5) * 1.9, (h.y - .5) * 1.)) ;
            col += lin(C[3]) * (1. - smoothstep(r * .5, r, d)) * .2 * P.z * (.7 + .3 * sin(PH + fi * 3.));
        }
    }
    int layers = int(P.x);
    for (int l = 0; l < 5; l++) {
        if (l >= layers) break;
        float fl = float(l);
        float cells = 10. - fl * 1.8;
        float per = ceil(cells * (1. + .6 * fl));
        vec2 q = p * cells + vec2(fl * 7.3 + P.w * sin(PH) * .4, T * per);
        vec2 id0 = floor(q);
        float acc = 0.;
        for (int dx = -1; dx <= 1; dx++)
            for (int dy = -1; dy <= 1; dy++) {
                vec2 id = id0 + vec2(dx, dy);
                vec3 h = hash33(vec3(id.x, mod(id.y, per), fl * 3.1));
                if (h.z < .3) continue;
                vec2 c = id + .5 + (h.xy - .5) * .7;
                c.x += .25 * sin(PH + h.z * 20.);
                float d = length(q - c);
                float sz = P.y * (.018 + .028 * h.z) * (1. + fl * .25);
                acc += exp(-d * d / (sz * sz)) * (.5 + .5 * h.z);
            }
        col += lin(C[2]) * min(acc, 1.) * (.35 + fl * .16);
    }
    return col;
}
