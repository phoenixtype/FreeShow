// Slowly turning sunburst. C0 edge, C1 centre, C2 ray tint. P: rays, contrast, glow.
vec3 scene(vec2 uv, vec2 p) {
    float r = length(p);
    float n = P.x;
    float a = atan(p.y, p.x) + T * TAU / n;
    float f = abs(fract(a * n / TAU) - .5) * 2.;
    float stripe = smoothstep(.45, .55, f);
    vec3 col = mix(lin(C[1]), lin(C[0]), sat(r * 1.1));
    col = mix(col, col * (1. - P.y) + lin(C[2]) * P.y * .4, stripe * sat(r * 3.));
    col += lin(C[1]) * exp(-r * 4.) * P.z;
    return col;
}
