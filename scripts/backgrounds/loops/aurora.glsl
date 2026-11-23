// Northern lights over a dark ridge. C0 sky top, C1 horizon, C2 low light, C3 high light, C4 stars. P.x strength.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = mix(lin(C[1]), lin(C[0]), pow(uv.y, .7));
    vec2 q = p * 180.;
    vec2 id = floor(q);
    float h = hash21(id);
    if (h > .985) {
        vec2 o = hash22(id) - .5;
        float d = length(fract(q) - .5 - o * .6);
        col += lin(C[4]) * exp(-d * d * 30.) * (.5 + .5 * sin(PH * (1. + floor(fract(h * 97.) * 3.)) + h * 80.));
    }
    for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float f = lfbm(vec2(p.x * 1.4 + fj * 3., fj), 2., 4);
        float base = -.24 + fj * .05 + f * .2;
        float rise = p.y - base;
        float band = smoothstep(-.015, .02, rise) * exp(-max(rise, 0.) * (2.6 - fj * .3));
        float streak = .55 + .45 * (lfbm(vec2(p.x * 24. + fj * 9., fj), 2., 2) * .5 + .5);
        col += mix(lin(C[2]), lin(C[3]), sat(rise * 3.)) * band * streak * P.x * (.55 - fj * .08);
    }
    float ridge = -.38 + .05 * fbm(vec3(p.x * 3., 0., 0.), vec3(0.), 3) + .03 * sin(p.x * 2.);
    return mix(col, lin(C[0]) * .15, fill(p.y - ridge));
}
