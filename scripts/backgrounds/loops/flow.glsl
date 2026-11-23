// Soft flowing gradient, calm enough to set words on. C0..C3 dark to light.
// P: scale, warp, highlight, vignette. Q.x evolution, Q.y vertical bias.
vec3 scene(vec2 uv, vec2 p) {
    float zp = max(Q.x, 1.);
    vec2 q = p * P.x + vec2(SEED * 3.1, SEED * 1.7);
    vec2 w = vec2(lfbm(q * .8, zp, 2), lfbm(q * .8 + vec2(5.2, 1.3), zp, 2));
    float n = lfbm(q + P.y * w, zp, 3);
    n = sat(n * 1.35 + .5 + (uv.y - .5) * Q.y);
    n = n * n * (3. - 2. * n);
    vec3 col = mix(lin(C[0]), lin(C[1]), smoothstep(0., .55, n));
    col = mix(col, lin(C[2]), smoothstep(.35, .9, n));
    col = mix(col, lin(C[3]), smoothstep(.75, 1., n) * P.z);
    vec2 v = p * vec2(.8, 1.);
    return col * (1. - P.w * dot(v, v) * 1.5);
}
