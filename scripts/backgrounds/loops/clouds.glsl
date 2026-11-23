// Sky and clouds. C0 sky top, C1 horizon, C2 lit cloud, C3 sun, C4 cloud shadow. P: sun x, sun y, cover, rays.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = mix(lin(C[1]), lin(C[0]), pow(uv.y, .8));
    vec2 sun = P.xy;
    float sd = length(p - sun);
    col += lin(C[3]) * (exp(-sd * 2.5) * .7 + exp(-sd * 18.) * 1.2);
    vec2 q = vec2(p.x * 1.3 + .05 * sin(PH), p.y * 2.6) + 3.;
    float n = lfbm(q + .4 * vec2(lfbm(q * .6, 1., 3), 0.), 1., 6) * .5 + .5;
    float cov = smoothstep(.6 - .12 * P.z, .7 - .1 * P.z, n);
    float lit = sat(1. - sd * .8);
    vec3 cc = mix(lin(C[4]), lin(C[2]), lit * .8 + .2 * smoothstep(.5, .9, n));
    col = mix(col, cc, cov * .95);
    col += lin(C[3]) * rays(p, sun, 6.) * exp(-sd * 1.2) * P.w * (1. - cov * .6);
    return col;
}
