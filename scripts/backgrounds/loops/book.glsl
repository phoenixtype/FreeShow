// An open Bible giving light. C0 top, C1 bottom, C2 pages, C3 light, C4 cover. P: size, y, light, dust.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    vec2 o = vec2(0., P.y);
    float s = P.x;
    vec2 q = (p - o) / s;
    float ax = abs(q.x);
    float top = .06 + .26 * sqrt(ax) - .14 * ax;
    float bot = -.2 + .1 * sqrt(ax);
    vec2 src = o + vec2(0., .2 * s);
    col += lin(C[3]) * rays(p, src, 6.) * exp(-length(p - src) * 1.4) * smoothstep(-.05, .2, p.y - src.y + .1) * P.z;
    col += lin(C[3]) * exp(-length(p - src) * 3.5) * .5 * P.z;
    float cover = max(max(ax - 1.05, bot - .05 - q.y), q.y - bot - .02);
    col = mix(col, lin(C[4]), fill(cover * s));
    float page = max(ax - 1., max(bot - q.y, q.y - top));
    float yr = (q.y - bot) / max(top - bot, 1e-3);
    float shade = .5 + .5 * smoothstep(0., .4, ax);
    float lines = 1. - .1 * smoothstep(.25, .45, abs(fract(yr * 26.) - .5)) * step(.12, yr) * step(yr, .88) * step(.1, ax) * step(ax, .9);
    float edge = 1. - .25 * smoothstep(.95, 1., ax);
    vec3 pc = lin(C[2]) * shade * lines * edge * (.8 + .3 * P.z * (1. - yr * .5));
    col = mix(col, pc, fill(page * s));
    col += dust(p, src, int(P.w), lin(C[3]), 1.3);
    return col;
}
