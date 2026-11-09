import json, math
from PIL import Image, ImageDraw, ImageFilter

data = json.load(open('D:/dsh-plugins/dsh-memory-starmap/test/heart-layout.json', encoding='utf-8'))
nodes = data['nodes']
scale = data['scale']

KIND = {
    'document': (103, 200, 255),
    'skill': (255, 182, 77),
    'space': (255, 207, 92),
    'session': (255, 95, 174),
    'file': (125, 99, 255),
    'runtime': (47, 211, 154),
    'insight': (124, 240, 192),
}


def heart_outline(t):
    s = math.sin(t)
    return (16 * s * s * s) / 16, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17


Y_OFF = 0.145
W, H = 1100, 760


def render(yaw_deg, pitch_deg, name):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    dist, fov = 1900.0, 900.0
    ox, oy = W / 2, H / 2

    def proj(x, y, z):
        x1 = x * cy - z * sy
        z1 = x * sy + z * cy
        y2 = y * cp - z1 * sp
        z2 = y * sp + z1 * cp
        d = dist - z2
        if d < 60:
            return None
        s = fov / d
        return ox + x1 * s, oy - y2 * s, d, s

    img = Image.new('RGB', (W, H), (4, 6, 13))
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, 'RGBA')

    # interior wash
    core = proj(0, Y_OFF * scale * 0.5, 0)
    if core:
        r = scale * 1.15 * core[3] * 0.5
        for step in range(14):
            t = step / 14
            rr = r * (1 - t * 0.6)
            d.ellipse([core[0] - rr, core[1] - rr, core[0] + rr, core[1] + rr],
                      fill=(255, 86, 140, int(6 + t * 3)))
    # nested contour copies at different depths
    DEPTH = 0.62
    for level, rr in [(-0.88, 0.48), (-0.5, 0.82), (0.0, 1.0), (0.5, 0.82), (0.88, 0.48)]:
        fade = 1 - abs(level) * 0.5
        depth = level * DEPTH * scale
        for width, alpha in [(14, 14), (5.5, 30), (2, 108)]:
            pts = []
            for i in range(97):
                ux, uy = heart_outline(i / 96 * math.pi * 2)
                p = proj(ux * rr * scale, (uy + Y_OFF) * rr * scale, depth)
                if p:
                    pts.append((p[0], p[1]))
            if len(pts) > 3:
                d.line(pts + [pts[0]], fill=(255, 124, 172, int(alpha * fade)),
                       width=max(1, int(width * scale / 320)))
    for width, alpha in [(46, 9), (26, 13)]:
        pts = []
        for i in range(97):
            ux, uy = heart_outline(i / 96 * math.pi * 2)
            p = proj(ux * 1.045 * scale, (uy + Y_OFF) * 1.045 * scale, 0)
            if p:
                pts.append((p[0], p[1]))
        if len(pts) > 3:
            d.line(pts + [pts[0]], fill=(255, 86, 140, alpha), width=max(1, int(width * scale / 320)))

    overlay = overlay.filter(ImageFilter.GaussianBlur(2.2))
    img = Image.alpha_composite(img.convert('RGBA'), overlay)
    d2 = ImageDraw.Draw(img, 'RGBA')

    items = []
    for n in nodes:
        q = proj(n['x'], n['y'], n['z'])
        if q is None:
            continue
        items.append((q[2], n, q))
    items.sort(key=lambda t: -t[0])

    for depth, n, q in items:
        x, y, dep, s = q
        color = KIND.get(n['kind'], (200, 220, 255))
        weight = 1.0 + (1.0 - n['rank']) * 3.0
        r = max(1.0, weight * s * 1.4)
        halo = r * 3.2
        for step in range(5):
            t = step / 5
            rr = halo * (1 - t * 0.7)
            d2.ellipse([x - rr, y - rr, x + rr, y + rr], fill=color + (int(22 * (1 - t) + 5),))
        d2.ellipse([x - r, y - r, x + r, y + r], fill=color + (240,))

    out = f'D:/dsh-plugins/dsh-memory-starmap/test/heart-{name}.png'
    img.convert('RGB').save(out)
    print('wrote', out)


render(0, 0, 'front')
render(34, -14, 'three-quarter')
render(86, -4, 'side')