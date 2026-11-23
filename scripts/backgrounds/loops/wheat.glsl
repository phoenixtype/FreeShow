// Wheat swaying in evening light. C0 sky top, C1 horizon, C2 sun, C3 stalks, C4 rim light. P: sun x, sun y, density.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = mix(lin(C[1]), lin(C[0]), pow(uv.y, .7));
    vec2 sun = P.xy;
    col += lin(C[2]) * (exp(-length(p - sun) * 3.) * .8 + exp(-length(p - sun) * 25.) * 1.5);
    for (int l = 0; l < 3; l++) {
        float fl = float(l);
        float cells = P.z * (34. - fl * 9.);
        float base = -.5 + .02 * (2. - fl);
        float hgt = .22 + fl * .1;
        float x = p.x * cells;
        float id0 = floor(x);
        float m = 0., rim = 0.;
        for (int dx = -2; dx <= 2; dx++) {
            float id = id0 + float(dx);
            vec3 h = hash33(vec3(id, fl, 4.));
            float bx = (id + .5 + (h.x - .5) * .8) / cells;
            float H = hgt * (.7 + .3 * h.y);
            float sway = .06 * sin(PH + id * .35 + fl) + .03 * sin(PH * 2. + id * .9);
            vec2 tip = vec2(bx + sway * H * 2., base + H);
            vec2 a = vec2(bx, base);
            float stalk = sdSegment(p, a, tip) - .0012 * (1. + fl);
            vec2 dir = normalize(tip - a);
            vec2 lp = p - (tip - dir * .03 * (1. + fl * .5));
            vec2 lq = vec2(dot(lp, vec2(dir.y, -dir.x)), dot(lp, dir));
            float head = length(lq * vec2(1., .22)) - .0055 * (1. + fl * .5) * (.75 + .25 * sin(lq.y * 900.));
            float d = min(stalk, head);
            m = max(m, fill(d));
            rim = max(rim, exp(-max(d, 0.) * 300.) * exp(-length(p - sun) * 1.5));
        }
        float ground = fill(p.y - (base + .03 + .01 * sin(p.x * 5. + fl)));
        m = max(m, ground);
        vec3 lc = lin(C[3]) * (1.2 - .35 * fl);
        col = mix(col, lc, m);
        col += lin(C[4]) * rim * .5 * (1. - fl * .3);
    }
    return col;
}
