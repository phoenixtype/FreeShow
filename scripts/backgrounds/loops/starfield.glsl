// Stars and soft nebula. C0 deep, C1 nebula A, C2 nebula B, C3 star tint. P: nebula, star density.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = lin(C[0]);
    float n = lfbm(p * 1.3 + 7., 1., 6) * .5 + .5;
    float m = lfbm(p * 2.1 + 3., 1., 5) * .5 + .5;
    col += lin(C[1]) * pow(n, 3.) * P.x + lin(C[2]) * pow(m, 4.) * P.x * .8;
    col *= .6 + .4 * smoothstep(.3, .7, lfbm(p * 3. + 1., 1., 4) * .5 + .5);
    for (int l = 0; l < 3; l++) {
        float fl = float(l);
        vec2 q = p * (120. + fl * 140.) + fl * 31.;
        vec2 id = floor(q);
        float h = hash21(id + fl * 7.);
        if (h > 1. - P.y * (.06 - fl * .015)) {
            float d = length(fract(q) - .5 - (hash22(id) - .5) * .6);
            col += lin(C[3]) * exp(-d * d * 40.) * (.55 + .45 * sin(PH * (1. + fl) + h * 80.)) * (1.2 - fl * .3);
        }
    }
    return col;
}
