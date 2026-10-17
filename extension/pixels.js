import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

function decode(bytes) {
    const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(Gio.MemoryInputStream.new_from_bytes(bytes), null);
    const rgba = pixbuf.get_has_alpha() ? pixbuf : pixbuf.add_alpha(false, 0, 0, 0);
    return [rgba.get_width(), rgba.get_height(), rgba.read_pixel_bytes()];
}

// True when two PNGs decode to identical pixels, whatever their encoder or metadata chunks.
export function samePixels(a, b) {
    try {
        const [w1, h1, p1] = decode(a);
        const [w2, h2, p2] = decode(b);
        return w1 === w2 && h1 === h2 && p1.equal(p2);
    } catch (e) {
        return false;
    }
}
