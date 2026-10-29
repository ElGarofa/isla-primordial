extends SceneTree

func _initialize() -> void:
	var image := Image.load_from_file("res://icon.svg")
	if image == null or image.is_empty():
		push_error("No se pudo rasterizar el icon.svg")
		quit(1)
		return
	image.resize(512, 512, Image.INTERPOLATE_LANCZOS)
	var result := image.save_png("res://assets/ui/isla_splash.png")
	if result != OK:
		push_error("No se pudo guardar el splash PNG")
	quit(0 if result == OK else 1)
