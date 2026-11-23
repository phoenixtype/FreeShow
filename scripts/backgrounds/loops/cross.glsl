// The cross. C0 sky top, C1 horizon, C2 light, C3 silhouette, C4 accent.
// Q.y mode: 0 rays behind a dark cross, 1 cross of light, 2 glowing outline, 3 three crosses on a hill,
// 4 soft cross over a flowing gradient, 5 one cross on a hill at sunrise. P: size, y, light strength, dust.
float hill(float x, float top) { return top - .22 * x * x + .015 * sin(x * 7. + 1.); }
vec3 sky(vec2 uv, vec2 p, vec2 sun) {
    vec3 col = vgrad(uv, 0, 1);
    float cl = lfbm(vec2(p.x * 1.6, p.y * 3.5) + 2., 1., 5) * .5 + .5;
    col = mix(col, mix(lin(C[1]), lin(C[2]), .5) * 1.1, smoothstep(.5, .8, cl) * .35 * smoothstep(-.2, .3, p.y));
    col += lin(C[2]) * exp(-length(p - sun) * 3.5) * .9 * P.z;
    return col;
}
vec3 scene(vec2 uv, vec2 p) {
    float mode = Q.y;
    float s = P.x;
    vec2 c = vec2(0., P.y);
    if (mode < .5) {
        vec3 col = mix(lin(C[1]), lin(C[0]), sat(length(p - c) * 1.3));
        col += lin(C[2]) * rays(p, c + vec2(0., .1 * s), 5.) * exp(-length(p - c) * 1.2) * P.z;
        col += lin(C[2]) * exp(-length(p - c - vec2(0., .1 * s)) * 4.) * .8 * P.z;
        float d = sdCross(p - c, s);
        col = mix(col, lin(C[3]), fill(d));
        col += dust(p, c, int(P.w), lin(C[2]), 1.);
        return col;
    }
    if (mode < 1.5) {
        vec3 col = vgrad(uv, 0, 1);
        float d = sdCross(p - c, s);
        float breathe = .85 + .15 * sin(PH);
        col += lin(C[2]) * rays(p, c + vec2(0., .1 * s), 6.) * exp(-length(p - c) * 1.6) * P.z * .6;
        col += lin(C[2]) * (exp(-max(d, 0.) * 18.) * .55 + exp(-max(d, 0.) * 60.) * .5) * breathe * P.z;
        col = mix(col, lin(C[4]), fill(d));
        col += dust(p, c, int(P.w), lin(C[2]), 1.);
        return col;
    }
    if (mode < 2.5) {
        vec3 col = vgrad(uv, 0, 1);
        col += lin(C[4]) * .25 * (lfbm(p * 1.2, 1., 4) * .5 + .5);
        float d = abs(sdCross(p - c, s)) - .004;
        float breathe = .75 + .25 * sin(PH);
        col += lin(C[2]) * (fill(d) * 1.2 + exp(-abs(d) * 40.) * .6 + exp(-abs(d) * 9.) * .25) * breathe * P.z;
        return col;
    }
    if (mode < 3.5) {
        vec2 sun = vec2(.0, -.08);
        vec3 col = sky(uv, p, sun);
        col += lin(C[2]) * rays(p, sun, 5.) * exp(-length(p - sun) * 1.5) * .5 * P.z;
        float d = p.y - hill(p.x, -.2);
        d = min(d, sdCross(p - vec2(0., .0), .4 * s));
        d = min(d, sdCross(p - vec2(-.36, -.09), .28 * s));
        d = min(d, sdCross(p - vec2(.36, -.09), .28 * s));
        return mix(col, lin(C[3]), fill(d));
    }
    if (mode < 4.5) {
        vec2 q = p * 1.1;
        vec2 w = vec2(lfbm(q, 1., 4), lfbm(q + vec2(5.2, 1.3), 1., 4));
        float n = sat(lfbm(q + w, 1., 5) * 1.7 + .5);
        vec3 col = mix(lin(C[0]), lin(C[1]), smoothstep(0., .6, n));
        col = mix(col, lin(C[4]), smoothstep(.55, 1., n));
        float d = sdCross(p - c, s);
        col += lin(C[2]) * (fill(d) * .45 + exp(-max(d, 0.) * 14.) * .3) * P.z;
        return col;
    }
    vec2 sun = vec2(.25, -.02);
    vec3 col = sky(uv, p, sun);
    col += lin(C[2]) * rays(p, sun, 6.) * exp(-length(p - sun) * 1.3) * .6 * P.z;
    float d = min(p.y - hill(p.x + .2, -.28), sdCross(p - vec2(-.25, -.02), .3 * s));
    return mix(col, lin(C[3]), fill(d));
}
