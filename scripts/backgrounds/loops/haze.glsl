// Stage haze lit by moving beams. C0 background, C1..C3 beam colours. P: beams, width, strength, haze.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = lin(C[0]);
    float hz = lfbm(p * 1.8 + 2., 1., 5) * .5 + .5;
    float haze = mix(1., hz, P.w);
    int n = int(P.x);
    for (int i = 0; i < 8; i++) {
        if (i >= n) break;
        float fi = float(i);
        float t = n > 1 ? fi / float(n - 1) : .5;
        vec2 src = vec2((t - .5) * 1.5, .62);
        float ang = (t - .5) * -.6 + .35 * sin(PH + fi * 1.9);
        vec2 dir = vec2(sin(ang), -cos(ang));
        vec2 d = p - src;
        float along = dot(d, dir);
        float across = abs(d.x * dir.y - d.y * dir.x);
        float w = P.y * (.01 + along * .12);
        float beam = exp(-across * across / (w * w)) * smoothstep(0., .05, along) * exp(-along * .9);
        vec3 bc = pick3(t * .99, 1);
        col += bc * beam * haze * P.z;
        col += bc * exp(-length(d) * 25.) * .6;
    }
    col += lin(C[1]) * .04 * hz;
    return col;
}
