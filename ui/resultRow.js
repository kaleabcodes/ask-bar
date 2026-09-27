// One result: icon, title, subtitle and a kind label on the right.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

const COMPACT_ICON_SIZE = 22;

export const ResultRow = GObject.registerClass(
class ResultRow extends St.Button {
    /**
     * @param {import('../providers/types.js').Result} result
     * @param {{compact?: boolean}} [options]  compact: smaller icon, no subtitle
     */
    _init(result, {compact = false} = {}) {
        super._init({
            style_class: 'ab-row',
            track_hover: true,
            can_focus: false, // the entry keeps focus; arrows move the selection
            x_expand: true,
        });

        const box = new St.BoxLayout({style_class: 'ab-row-box', x_expand: true});
        const icon = result.createIcon();
        icon.y_align = Clutter.ActorAlign.CENTER;
        if (compact && 'icon_size' in icon)
            icon.icon_size = COMPACT_ICON_SIZE;
        box.add_child(icon);

        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const title = new St.Label({text: result.title, style_class: 'ab-row-title'});
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        text.add_child(title);
        if (result.subtitle && !compact) {
            const subtitle = new St.Label({text: result.subtitle, style_class: 'ab-row-subtitle'});
            subtitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(subtitle);
        }
        box.add_child(text);

        box.add_child(new St.Label({
            text: result.kind,
            style_class: 'ab-row-kind',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this.set_child(box);
    }

    setSelected(selected) {
        if (selected)
            this.add_style_pseudo_class('selected');
        else
            this.remove_style_pseudo_class('selected');
    }
});
