# Web app interactions

- Long presses on non-editable UI must not show selection menus, native callouts or context menus, or start dragging. Use the corresponding CSS and delegated event guards. Keep real editable fields and native form controls usable, and preserve scrolling, zoom and keyboard access.
- Player movement is always manual through the stick or direction keys; never add automatic movement or a movement assistance setting. Nearby tosses and toss/spike jumps are automatic. Player spikes and blocks require explicit input.
- Maintain a generous attack window and keep the mobile buttons, keyboard help and tests consistent with the controls.
