// Drops landing on still water. C0 deep, C1 sky reflection, C2 highlight. P: drops, ring speed, strength.
float height(vec2 p) {
    float h = 0.;
    int n = int(P.x);
    for (int i = 0; i < 10; i++) {
        if (i >= n) break;
        float fi = float(i);
        vec3 e = hash33(vec3(fi, 3., 8.));
        float age = fract(T * 2. - e.z);
        vec2 c = vec2((e.x - .5) * 1.5, (e.y - .5) * .8);
        float d = length((p - c) * vec2(1., 2.2));
        float r = age * P.y;
        h += sin((d - r) * 70.) * exp(-pow((d - r) * 12., 2.)) * (1. - age) * exp(-d * 1.5);
    }
    return h * P.z;
}
vec3 scene(vec2 uv, vec2 p) {
    float e = .002;
    float h = height(p);
    vec2 g = vec2(height(p + vec2(e, 0.)) - h, height(p + vec2(0., e)) - h) / e;
    vec3 n = normalize(vec3(-g * .02, 1.));
    vec3 col = mix(lin(C[0]), lin(C[1]), sat(uv.y + n.y * .8));
    col += lin(C[2]) * pow(sat(dot(n, normalize(vec3(.3, .6, 1.)))), 60.) * .8;
    col += lin(C[1]) * .08 * (lfbm(p * vec2(1., 4.), 1., 3) * .5 + .5);
    return col;
}
