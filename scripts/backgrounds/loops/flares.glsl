// Drifting warm light and lens streaks. C0 top, C1 bottom, C2..C4 lights. P: blobs, size, strength, streak.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    int n = int(P.x);
    for (int i = 0; i < 12; i++) {
        if (i >= n) break;
        float fi = float(i);
        vec3 h = hash33(vec3(fi, 1.7, 3.3));
        vec2 c = vec2(.75 * sin(PH * (1. + floor(h.x * 2.)) + h.y * TAU), .35 * cos(PH + h.z * TAU));
        float r = P.y * (.15 + .25 * h.z);
        float d = length(p - c);
        vec3 lc = pick3(h.y, 2);
        col += lc * exp(-d * d / (r * r)) * P.z * .6;
        col += lc * exp(-abs(p.y - c.y) * 90.) * exp(-abs(p.x - c.x) * 1.4) * P.w * .12;
    }
    col += lin(C[2]) * .08 * (lfbm(p * .8, 1., 3) * .5 + .5);
    return col;
}
