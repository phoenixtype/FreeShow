// Underwater light: caustics, rays from the surface, rising bubbles. C0 deep, C1 near the surface, C2 caustic light, C3 rays.
// P: caustic scale, strength, rays, bubbles.
float caust(vec2 p) {
    vec2 i = p;
    float c = 1.;
    for (int n = 0; n < 5; n++) {
        float t = PH * (n < 2 ? -1. - float(n) : float(n) - 1.);
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1. / length(vec2(p.x / (sin(i.x + t) / .005), p.y / (cos(i.y + t) / .005)));
    }
    c /= 5.;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.);
}
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = mix(lin(C[0]), lin(C[1]), pow(uv.y, 1.5));
    vec2 w = vec2(lfbm(p * .9, 1., 3), lfbm(p * .9 + 4., 1., 3)) * .7;
    vec2 q = (p + w) * P.x;
    float c = caust(mod(q * TAU, TAU) - 250.);
    col += lin(C[2]) * c * P.y * (.35 + .65 * uv.y);
    vec2 s = vec2(.15, .9);
    col += lin(C[3]) * rays(p, s, 4.) * exp(-length(p - s) * 1.1) * P.z;
    int n = int(P.w);
    for (int k = 0; k < 80; k++) {
        if (k >= n) break;
        float fk = float(k);
        vec3 e = hash33(vec3(fk, 9., 4.));
        vec2 b = vec2((e.x - .5) * 1.8 + .02 * sin(PH * 3. + fk), fract(e.y + T * (1. + floor(e.z * 2.))) * 1.2 - .6);
        float r = .004 + .01 * e.z;
        float d = abs(length(p - b) - r);
        col += lin(C[2]) * exp(-d * d / (r * r * .04)) * .25;
    }
    return col;
}
