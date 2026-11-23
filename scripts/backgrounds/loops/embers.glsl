// Rising embers or motes. C0 top, C1 bottom, C2 hot, C3 warm. P: count, size, glow, floor glow.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    col += lin(C[3]) * P.w * exp(-(p.y + .5) * 3.) * (.7 + .3 * lfbm(vec2(p.x * 2., 0.), 2., 2));
    int n = int(P.x);
    for (int i = 0; i < 220; i++) {
        if (i >= n) break;
        float fi = float(i);
        vec3 h = hash33(vec3(fi, 7., fi * 1.3));
        vec3 g = hash33(vec3(fi * .3, 1., 2.));
        float k = 1. + floor(g.x * 2.);
        float yy = fract(h.y + T * k);
        vec2 c = vec2((h.x - .5) * 1.9 + .05 * sin(PH * k + fi) + .02 * sin(PH * 3. + fi * 2.), yy * 1.25 - .62);
        float sz = P.y * (.0015 + .004 * h.z);
        float d = length(p - c);
        float glow = exp(-d * d / (sz * sz)) + .15 * exp(-d / (sz * 6.));
        float fl = .6 + .4 * sin(PH * (2. + floor(g.y * 3.)) + fi * 5.);
        col += mix(lin(C[2]), lin(C[3]), g.z) * glow * sin(yy * PI) * fl * P.z;
    }
    return col;
}
