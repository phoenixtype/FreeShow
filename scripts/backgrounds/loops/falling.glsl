// Falling or rising shapes: leaves, petals, hearts, confetti. C0 top, C1 bottom, C2..C4 colours.
// P: shape (0 leaf, 1 petal, 2 heart, 3 confetti), size, opacity, direction (-1 falls, +1 rises). Q.x layers, Q.y density.
float dot2(vec2 v) { return dot(v, v); }
float sdVesica(vec2 p, float r, float d) {
    p = abs(p);
    float b = sqrt(r * r - d * d);
    return ((p.y - b) * d > p.x * b) ? length(p - vec2(0., b)) : length(p - vec2(-d, 0.)) - r;
}
float sdHeart(vec2 p) {
    p.y += .5;
    p.x = abs(p.x);
    if (p.y + p.x > 1.) return sqrt(dot2(p - vec2(.25, .75))) - sqrt(2.) / 4.;
    return sqrt(min(dot2(p - vec2(0., 1.)), dot2(p - .5 * max(p.x + p.y, 0.)))) * sign(p.x - p.y);
}
float shape(vec2 q, float kind) {
    if (kind < .5) return sdVesica(q, .5, .2);
    if (kind < 1.5) return max(length(q * vec2(1.7, 1.)) - .42, -(length(q - vec2(0., .45)) - .12));
    if (kind < 2.5) return sdHeart(q * 1.6) / 1.6;
    return sdBox(q, vec2(.22, .42));
}
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    int layers = int(Q.x);
    for (int l = 0; l < 4; l++) {
        if (l >= layers) break;
        float fl = float(l);
        float cells = (6.5 - fl * 1.5) / P.y;
        float per = ceil(cells * (1. + .5 * fl));
        vec2 q = p * cells + vec2(fl * 5.1, -P.w * T * per);
        vec2 id0 = floor(q);
        for (int dx = -1; dx <= 1; dx++)
            for (int dy = -1; dy <= 1; dy++) {
                vec2 id = id0 + vec2(dx, dy);
                vec3 h = hash33(vec3(id.x, mod(id.y, per), fl * 4.7));
                if (h.z > Q.y) continue;
                vec3 g = hash33(vec3(id.x * 1.3, mod(id.y, per) * .7, fl + 2.));
                vec2 c = id + .5 + (h.xy - .5) * .6;
                c.x += .3 * sin(PH + g.x * 30.);
                float spin = g.y > .5 ? 1. : -1.;
                vec2 lq = rot(g.z * TAU + PH * spin) * (q - c);
                lq.x /= max(abs(cos(PH * (1. + floor(g.x * 2.)) + g.y * 9.)), .18);
                float sz = .32 + .18 * h.z;
                float d = shape(lq / sz, P.x) * sz;
                float aa = (.02 + .05 * (1. - fl / 3.)) * (fl < 1. ? 3. : 1.);
                float m = 1. - smoothstep(-aa, aa, d);
                vec3 lc = pick3(g.x, 2) * (.8 + .35 * sat(-lq.y));
                col = mix(col, lc, m * P.z * (.45 + .55 * fl / max(1., float(layers - 1))));
            }
    }
    return col;
}
