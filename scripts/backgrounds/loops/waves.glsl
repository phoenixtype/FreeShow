// Silk lines. C0 top, C1 bottom, C2/C3 line colours. P: lines, amplitude, thickness, glow. Q.x centre height.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    int n = int(P.x);
    for (int i = 0; i < 60; i++) {
        if (i >= n) break;
        float t = float(i) / max(1., float(n - 1));
        float y = Q.x + P.y * (.5 * sin(p.x * 2.2 + PH + t * 2.5) + .3 * sin(p.x * 3.7 - PH * 2. + t * 4.) + .2 * sin(p.x * 1.3 + PH + t)) + (t - .5) * .32;
        float d = abs(p.y - y);
        float line = exp(-d / (P.z * .0022)) * .6 + exp(-d / (P.z * .025)) * P.w;
        float fade = smoothstep(-.95, -.3, p.x) * smoothstep(.95, .3, p.x) * .7 + .3;
        col += mix(lin(C[2]), lin(C[3]), t) * line * fade * .25;
    }
    return col;
}
