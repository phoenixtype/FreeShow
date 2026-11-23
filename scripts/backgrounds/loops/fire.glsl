// Flames from the foot of the screen. C0 background, C1 deep red, C2 orange, C3 bright core. P: height, intensity, embers.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = lin(C[0]);
    vec2 q = vec2(p.x * 3.2, p.y * 2.2);
    float n = fbm(vec3(q.x, q.y - T * 12., T * 3.), vec3(0., 4., 3.), 5) * .5 + .5;
    float h = P.x * (.35 + .9 * pow(sat(fbm(vec3(p.x * 4., 0., T * 2.), vec3(0., 0., 2.), 3) * .8 + .5), 2.));
    float i = sat((1. - (p.y + .5) / h) * 1.3 + (n - .5) * 1.8 - .15) * P.y;
    col = mix(col, lin(C[1]), smoothstep(0., .25, i));
    col = mix(col, lin(C[2]), smoothstep(.25, .6, i));
    col = mix(col, lin(C[3]), smoothstep(.6, 1., i));
    col += lin(C[2]) * .12 * exp(-(p.y + .5) * 2.);
    int count = int(P.z);
    for (int k = 0; k < 120; k++) {
        if (k >= count) break;
        float fk = float(k);
        vec3 e = hash33(vec3(fk, 5., 1.));
        float yy = fract(e.y + T * (2. + floor(e.z * 2.)));
        vec2 c = vec2((e.x - .5) * 1.8 + .06 * sin(PH * 2. + fk), yy * 1.2 - .55);
        float d = length(p - c);
        col += lin(C[3]) * exp(-d * d / 4e-6) * sin(yy * PI) * .9;
    }
    return col;
}
