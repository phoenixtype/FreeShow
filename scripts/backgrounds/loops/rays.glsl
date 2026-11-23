// God rays. C0 dark, C1 glow, C2 rays, C3 dust. P: source x, y, strength, dust count. Q.x ray frequency.
vec3 scene(vec2 uv, vec2 p) {
    vec2 s = P.xy;
    float r = length(p - s);
    vec3 col = mix(lin(C[0]), lin(C[1]), exp(-r * 1.8));
    col += lin(C[2]) * rays(p, s, Q.x) * exp(-r * .9) * smoothstep(0., .08, r) * P.z;
    col += lin(C[2]) * exp(-r * 6.) * .6 * P.z;
    col += dust(p, s, int(P.w), lin(C[3]), 1.);
    return col;
}
