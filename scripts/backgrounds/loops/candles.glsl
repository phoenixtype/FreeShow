// Candles. C0 top, C1 bottom, C2 wax, C3 flame, C4 background lights. P: count, size, glow, bokeh.
// Q.y: wax colour of the last candle from C5 when 1 (the Christ candle).
float flameSd(vec2 q) {
    q.x *= 1. + 5. * sat(q.y * 12.);
    return length(q * vec2(1., .55)) - .05;
}
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    for (int i = 0; i < 30; i++) {
        float fi = float(i);
        vec3 h = hash33(vec3(fi, 6., 2.));
        vec2 bc = vec2((h.x - .5) * 1.9, (h.y - .3) * .9);
        float r = .04 + .07 * h.z;
        col += lin(C[4]) * (1. - smoothstep(r * .4, r, length(p - bc))) * .14 * P.w * (.7 + .3 * sin(PH + fi));
    }
    int n = int(P.x);
    float s = P.y;
    float gap = .32 * s;
    for (int i = 0; i < 7; i++) {
        if (i >= n) break;
        float fi = float(i);
        float x = (fi - float(n - 1) * .5) * gap;
        float hgt = (.42 - .06 * abs(fi - float(n - 1) * .5)) * s;
        float base = -.5;
        float top = base + hgt;
        float w = .055 * s;
        vec3 wax = (Q.y > .5 && i == n / 2 && n % 2 == 1) ? lin(C[5]) : lin(C[2]);
        float body = sdBox(p - vec2(x, base + hgt * .5), vec2(w, hgt * .5)) - .006;
        float shade = .55 + .45 * sat(1. - abs(p.x - x + w * .3) / w);
        float lit = .6 + .4 * sat(1. - (top - p.y) * 3.);
        col = mix(col, wax * shade * lit, fill(body));
        float fl = lfbm(vec2(fi * 3., 0.), 3., 2);
        vec2 fp = vec2(x + fl * .006, top + .07 * s);
        vec2 q = (p - fp) / s;
        q.x += .01 * sin(q.y * 20. + PH * 3. + fi);
        float fd = flameSd(q);
        float wick = sdBox(p - vec2(x, top + .012 * s), vec2(.0025 * s, .014 * s));
        col = mix(col, lin(C[3]) * .15, fill(wick));
        float flick = .9 + .1 * sin(PH * 5. + fi * 2.) + .05 * fl;
        col += mix(lin(C[3]), vec3(1.), sat(-fd * 45.)) * fill(fd * s) * 1.4 * flick + lin(C[3]) * exp(-max(fd, 0.) * 30.) * .35 * flick;
        col += lin(C[3]) * exp(-length(p - fp) * 5.) * .35 * P.z * flick;
    }
    return col;
}
