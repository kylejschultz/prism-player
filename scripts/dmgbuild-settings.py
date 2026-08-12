import os

application = defines["application"]
background = os.path.join(defines["assets"], "background.png")

files = [application]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
window_rect = ((120, 120), (1000, 620))
icon_size = 112
text_size = 13
default_view = "icon-view"
show_toolbar = False
show_status_bar = False
show_sidebar = False
show_pathbar = False
show_tab_view = False
icon_locations = {
    "Prism Player.app": (265, 315),
    "Applications": (735, 315),
}
