// Fireworks. C0 sky top, C1 sky bottom, C2..C4 burst colours. P: bursts, sparks per burst, size.
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = vgrad(uv, 0, 1);
    int bursts = int(P.x), sparks = int(P.y);
    for (int b = 0; b < 8; b++) {
        if (b >= bursts) break;
        float fb = float(b);
        vec3 hb = hash33(vec3(fb, 11., 3.));
        float age = fract(T - (fb + hb.x * .5) / float(bursts));
        float life = .45;
        if (age > life) continue;
        float a = age / life;
        vec2 c = vec2((hb.y - .5) * 1.4, .02 + hb.z * .28);
        float rad = P.z * (.16 + .12 * hb.y);
        if (length(p - c) > rad * 1.4 + .35) continue;
        vec3 bc = pick3(fract(hb.x * 7.), 2);
        float fade = pow(1. - a, 1.6);
        col += bc * exp(-length(p - c) * 22.) * exp(-a * 14.) * 1.2;
        float grow = 1. - pow(1. - a, 3.);
        float grow0 = 1. - pow(1. - max(a - .07, 0.), 3.);
        for (int i = 0; i < 120; i++) {
            if (i >= sparks) break;
            float fi = float(i);
            vec2 hh = hash22(vec2(fi, fb * 7.1));
            float ang = fi / float(sparks) * TAU + hh.x * .2;
            vec2 dir = vec2(cos(ang), sin(ang)) * (.75 + .25 * hh.y);
            vec2 pos = c + dir * rad * grow - vec2(0., .08 * a * a);
            vec2 pos0 = c + dir * rad * grow0 - vec2(0., .08 * a * a);
            float d = sdSegment(p, pos0, pos);
            float g = exp(-d * d / 6e-6) + exp(-d / .006) * .03;
            col += bc * g * fade * (.7 + .3 * sin(fi * 7. + a * 60.));
        }
    }
    return col;
}
