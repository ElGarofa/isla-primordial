extends Node

var failures: Array[String] = []

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	await get_tree().process_frame
	_expect(GameState.items.size() == 75, "carga de 75 objetos del catálogo")
	_expect(GameState.recipes.size() == 52, "carga de 52 recetas originales")
	_expect(GameState.fauna_data.get("catalogue", []).size() == 162, "carga del catálogo de fauna")
	_expect(GameState.regions_data.get("provinces", []).size() == 12, "carga de las 12 provincias")
	var map := IslaWorldMap.new()
	_expect(map.n == 768 and map.size == 12288, "rejilla real de 12,288 km")
	_expect(map.get_height(6140.0, 6140.0) < 0.0, "fondo oceánico fuera del continente")
	_expect(map.get_biome_id(0.0, 2300.0) != 0, "bioma terrestre de Hell Creek")
	var spawn_world := IslaIslandWorld.new()
	spawn_world.map_data = map
	var spawn := spawn_world._find_spawn()
	print("SPAWN_VALIDATION: ", spawn, " ground=", map.get_height(spawn.x, spawn.z), " biome=", spawn_world.get_biome(spawn.x, spawn.z), " province=", spawn_world.get_province(spawn.x, spawn.z))
	_expect(map.get_height(spawn.x, spawn.z) > 1.4 and spawn.y > 1.5, "aparición en terreno sobre el nivel del mar")
	spawn_world.free()
	var icon_directory := DirAccess.open("res://assets/icons")
	var icon_count := 0
	icon_directory.list_dir_begin()
	var icon_file := icon_directory.get_next()
	while not icon_file.is_empty():
		if icon_file.ends_with(".webp"):
			icon_count += 1
			_expect(ResourceLoader.load("res://assets/icons/" + icon_file) != null, "importa icono " + icon_file)
		icon_file = icon_directory.get_next()
	icon_directory.list_dir_end()
	_expect(icon_count == 67, "los 67 iconos originales están presentes")
	_expect(ResourceLoader.load("res://assets/audio/temita.mp3") != null, "importa la música original del menú")
	_expect(ResourceLoader.load("res://assets/godot_models/objetos/antorcha.glb") is PackedScene, "carga modelo de objeto convertido a Godot")
	_expect(ResourceLoader.load("res://assets/godot_models/fauna/hf/parasaurolophus.glb") is PackedScene, "carga modelo de fauna convertido a Godot")

	var save_path := ProjectSettings.globalize_path(GameState.SAVE_PATH)
	var previous_save := ""
	var had_save := FileAccess.file_exists(GameState.SAVE_PATH)
	if had_save:
		var old_file := FileAccess.open(GameState.SAVE_PATH, FileAccess.READ)
		previous_save = old_file.get_as_text()
	GameState.new_game()
	_expect(is_equal_approx(float(GameState.stats.mojado), 0.0), "partida nueva empieza seca")
	_expect(GameState.inventory.size() == 30, "mochila de 30 espacios")
	GameState.add_item("madera", 3)
	_expect(GameState.craft("hacha_piedra"), "fabricación inicial con datos originales")
	_expect(GameState.item_count("hacha_piedra") == 1, "resultado y coste de fabricación")
	GameState.stats.vida = 43.0
	_expect(GameState.save_game(), "guardado JSON local")
	GameState.new_game()
	_expect(GameState.continue_game(), "carga de partida guardada")
	_expect(GameState.item_count("hacha_piedra") == 1, "inventario restaurado")
	_expect(is_equal_approx(float(GameState.stats.vida), 43.0), "estadísticas restauradas")
	if had_save:
		var restore := FileAccess.open(GameState.SAVE_PATH, FileAccess.WRITE)
		restore.store_string(previous_save)
		restore.close()
	else:
		DirAccess.remove_absolute(save_path)
	if failures.is_empty():
		print("MIGRATION_SMOKE: PASS (87 comprobaciones)")
		get_tree().quit(0)
	else:
		for failure in failures:
			push_error(failure)
		print("MIGRATION_SMOKE: FAIL (%d/87)" % failures.size())
		get_tree().quit(1)

func _expect(condition: bool, label: String) -> void:
	if condition:
		print("PASS: " + label)
	else:
		failures.append(label)
