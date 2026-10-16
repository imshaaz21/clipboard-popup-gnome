UUID := clipboard-popup@imshaaz21.github.com
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: pack install uninstall nested
pack:      ## build dist/$(UUID).shell-extension.zip for extensions.gnome.org
	mkdir -p dist
	gnome-extensions pack extension --extra-source=history.js --force --out-dir=dist

install: pack ## install the packed build for the current user
	gnome-extensions install --force dist/$(UUID).shell-extension.zip
	@echo "Log out/in (Wayland) or press Alt+F2, r (X11), then: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)

SHELL_MAJOR := $(shell gnome-shell --version | grep -o '[0-9]*' | head -1)
SHELL_FLAGS ?= $(shell [ $(SHELL_MAJOR) -ge 49 ] && echo --devkit || echo --nested --wayland)
DEV := $(CURDIR)/dist/dev
nested:    ## try the repo code in a throw-away GNOME Shell
	rm -rf $(DEV)
	mkdir -p $(DEV)/gnome-shell/extensions/$(UUID)
	cp -r extension/. $(DEV)/gnome-shell/extensions/$(UUID)/
	glib-compile-schemas $(DEV)/gnome-shell/extensions/$(UUID)/schemas
	XDG_DATA_HOME=$(DEV) XDG_CONFIG_HOME=$(DEV)/config GSETTINGS_BACKEND=memory \
	GSETTINGS_SCHEMA_DIR=$(DEV)/gnome-shell/extensions/$(UUID)/schemas \
	dbus-run-session -- bash -c 'gnome-shell $(SHELL_FLAGS) & sleep 6; gnome-extensions enable $(UUID); wait'
