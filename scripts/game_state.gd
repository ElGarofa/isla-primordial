class_name IslaGameState
extends Node

signal inventory_changed
signal stats_changed
signal message_changed(text: String)
signal game_over(reason: String)

const SAVE_PATH := "user://isla_primordial_save.json"
const SLOT_COUNT := 30
const QUICK_SLOTS := 9
const DAY_LENGTH := 1500.0
const START_HOUR := 9.0
const DIFFICULTY := {"Fácil": {"consume": 0.65, "damage": 0.6, "gather": 1.5}, "Normal": {"consume": 1.0, "damage": 1.0, "gather": 1.0}, "Difícil": {"consume": 1.3, "damage": 1.4, "gather": 1.0}}

var item_data: Dictionary = {}
var recipes: Array = []
var forage: Dictionary = {}
var butchery: Dictionary = {}
var skills: Dictionary = {}
var fauna_data: Dictionary = {}
var regions_data: Dictionary = {}
var items: Dictionary = {}
var inventory: Array = []
var equipment: Dictionary = {"cabeza": null, "torso": null, "piernas": null, "pies": null, "espalda": null}
var known_recipes: Array[String] = []
var stats := {"vida": 100.0, "hambre": 100.0, "sed": 100.0, "energia": 100.0, "oxigeno": 100.0, "temperatura": 26.0, "sueno": 100.0, "mojado": 0.0}
var skills_xp := {"talla": 0.0, "cuero": 0.0, "caza": 0.0, "cocina": 0.0, "manejo": 0.0}
var placed_objects: Array[Dictionary] = []
var creature_records: Dictionary = {}
var saved_player_position: Vector3 = Vector3.ZERO
var world_changes: Dictionary = {}
var selected_slot: int = 0
var day_seconds: float = 0.0
var elapsed_game_time: float = 0.0
var difficulty: String = "Normal"
var is_sleeping: bool = false
var game_active: bool = false
var dead: bool = false
var last_message: String = ""
var message_timer: float = 0.0
var player_ref: Node3D
var island_ref: Node3D
var weather: String = "soleado"
var fire_warmth: float = 0.0

func _ready() -> void:
	item_data = _read_json("res://data/items.json")
	fauna_data = _read_json("res://data/fauna.json")
	regions_data = _read_json("res://data/regions.json")
	items = item_data.get("items", {})
	recipes = item_data.get("recipes", [])
	forage = item_data.get("forage", {})
	butchery = item_data.get("butchery", {})
	skills = item_data.get("skills", {})
	inventory.resize(SLOT_COUNT)
	inventory.fill(null)
	for recipe in recipes:
		var unlock_rule = recipe.get("aprende")
		if unlock_rule is String and unlock_rule == "inicio":
			known_recipes.append(str(recipe.get("clave", recipe.get("id", ""))))

func _process(delta: float) -> void:
	if message_timer > 0.0:
		message_timer = maxf(0.0, message_timer - delta)
	if not game_active or dead:
		return
	var scale := 40.0 if is_sleeping else 1.0
	var game_delta := delta * scale
	elapsed_game_time += game_delta
	day_seconds = fposmod(day_seconds + game_delta, DAY_LENGTH)
	var consume_mod: float = DIFFICULTY.get(difficulty, DIFFICULTY["Normal"]).consume
	var hot := 1.0 + maxf(0.0, float(stats.temperatura) - 24.0) * 0.025
	var rest_mod := 0.5 if is_sleeping else 1.0
	stats.hambre = maxf(0.0, stats.hambre - game_delta * consume_mod * rest_mod * 0.055)
	stats.sed = maxf(0.0, stats.sed - game_delta * consume_mod * rest_mod * (0.085 + maxf(0.0, float(stats.temperatura) - 24.0) * 0.006) * hot)
	if is_instance_valid(player_ref):
		var sheltered: bool = island_ref != null and island_ref.is_sheltered(player_ref.global_position)
		var by_fire: bool = island_ref != null and island_ref.is_near_fire(player_ref.global_position, 5.0)
		if weather == "lluvia" and not sheltered:
			stats.mojado = minf(100.0, float(stats.mojado) + game_delta * 2.2)
		else:
			stats.mojado = maxf(0.0, float(stats.mojado) - game_delta * (4.0 if by_fire else 0.55))
		var province_name: String = island_ref.get_province(player_ref.global_position.x, player_ref.global_position.z) if island_ref != null else ""
		var base_temperature := 24.0
		for province in regions_data.get("provinces", []):
			if province.get("id", "") == province_name:
				base_temperature = float(province.get("clima", {}).get("temp", 24.0))
				break
		var altitude := maxf(0.0, player_ref.global_position.y)
		stats.temperatura = base_temperature - altitude * 0.006 - float(stats.mojado) * 0.08 - (3.0 if weather == "lluvia" and not sheltered else 0.0)
	if is_sleeping:
		stats.sueno = minf(100.0, float(stats.sueno) + game_delta * 0.18)
		stats.energia = minf(100.0, float(stats.energia) + game_delta * 0.14)
	else:
		stats.sueno = maxf(0.0, float(stats.sueno) - game_delta / 24.0)
	if float(stats.sed) <= 0.0:
		damage(0.75 * delta, "Sed")
	elif float(stats.hambre) <= 0.0:
		damage(0.55 * delta, "Hambre")
	elif float(stats.vida) < 100.0 and float(stats.hambre) > 45.0 and float(stats.sed) > 45.0:
		stats.vida = minf(100.0, stats.vida + delta * 0.6)
	if message_timer == 0.0:
		last_message = ""	
	_age_food(game_delta)
	stats_changed.emit()

func _age_food(game_delta: float) -> void:
	for i in range(inventory.size()):
		var slot = inventory[i]
		if slot == null:
			continue
		var def: Dictionary = items.get(str(slot.id), {})
		if not def.has("pudre"):
			continue
		slot.freshness = float(slot.get("freshness", 1.0)) - game_delta / maxf(1.0, float(def.pudre))
		if float(slot.freshness) <= 0.0:
			var rotten_count := int(slot.count)
			inventory[i] = null
			add_item("podredumbre", rotten_count)
			message("Algo de comida se ha echado a perder.")
			inventory_changed.emit()

func _read_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("No se pudo abrir " + path)
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}

func new_game() -> void:
	inventory.fill(null)
	for key in stats.keys():
		stats[key] = 26.0 if key == "temperatura" else (0.0 if key == "mojado" else 100.0)
	for key in skills_xp.keys():
		skills_xp[key] = 0.0
	equipment = {"cabeza": null, "torso": null, "piernas": null, "pies": null, "espalda": null}
	known_recipes.clear()
	for recipe in recipes:
		var unlock_rule = recipe.get("aprende")
		if unlock_rule is String and unlock_rule == "inicio":
			known_recipes.append(str(recipe.get("clave", recipe.get("id", ""))))
	placed_objects.clear()
	world_changes.clear()
	creature_records.clear()
	selected_slot = 0
	day_seconds = 0.0
	weather = "soleado"
	elapsed_game_time = 0.0
	difficulty = "Normal"
	is_sleeping = false
	game_active = true
	dead = false
	add_item("fibra", 8)
	add_item("rama", 3)
	add_item("piedra", 3)
	add_item("baya", 4)
	message("Has llegado a la costa. Reúne recursos y prepara un refugio.")
	inventory_changed.emit()

func continue_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return false
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary or int(data.get("version", 0)) < 1:
		return false
	inventory = data.get("inventory", inventory)
	inventory.resize(SLOT_COUNT)
	stats = data.get("stats", stats)
	stats["mojado"] = float(stats.get("mojado", 0.0))
	stats["oxigeno"] = float(stats.get("oxigeno", 100.0))
	stats["vida"] = maxf(15.0, float(stats.get("vida", 100.0)))
	known_recipes.assign(data.get("known_recipes", []))
	skills_xp = data.get("skills_xp", skills_xp)
	equipment = data.get("equipment", equipment)
	placed_objects.assign(data.get("placed_objects", []))
	world_changes = data.get("world_changes", {})
	creature_records = data.get("creature_records", {})
	selected_slot = clampi(int(data.get("selected_slot", 0)), 0, QUICK_SLOTS - 1)
	day_seconds = float(data.get("day_seconds", 0.0))
	var player_position: Array = data.get("player_position", [])
	saved_player_position = Vector3(float(player_position[0]), float(player_position[1]), float(player_position[2])) if player_position.size() >= 3 else Vector3.ZERO
	elapsed_game_time = float(data.get("elapsed_game_time", 0.0))
	difficulty = data.get("difficulty", "Normal")
	game_active = true
	dead = false
	is_sleeping = false
	inventory_changed.emit()
	return true

func save_game() -> bool:
	var player_position: Array = []
	if is_instance_valid(player_ref):
		player_position = [player_ref.global_position.x, player_ref.global_position.y, player_ref.global_position.z]
	var data := {
		"version": 1,
		"inventory": inventory,
		"stats": stats,
		"known_recipes": known_recipes,
		"skills_xp": skills_xp,
		"equipment": equipment,
		"placed_objects": placed_objects,
		"world_changes": world_changes,
		"creature_records": creature_records,
		"selected_slot": selected_slot,
		"day_seconds": day_seconds,
		"elapsed_game_time": elapsed_game_time,
		"difficulty": difficulty,
		"player_position": player_position,
	}
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		message("No se pudo guardar la partida.")
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func hour_of_day() -> float:
	return fposmod(START_HOUR + day_seconds / DAY_LENGTH * 24.0, 24.0)

func current_item() -> String:
	if selected_slot >= inventory.size() or inventory[selected_slot] == null:
		return ""
	return str(inventory[selected_slot].get("id", ""))

func item_count(item_id: String) -> int:
	var total := 0
	for slot in inventory:
		if slot != null and slot.get("id", "") == item_id:
			total += int(slot.get("count", 0))
	return total

func item_weight() -> float:
	var total := 0.0
	for slot in inventory:
		if slot != null:
			total += float(items.get(slot.id, {}).get("peso", 0.0)) * int(slot.get("count", 0))
	return total

func item_volume() -> float:
	var total := 0.0
	for slot in inventory:
		if slot != null:
			total += float(items.get(slot.id, {}).get("vol", 0.0)) * int(slot.get("count", 0))
	return total

func add_item(item_id: String, amount: int = 1, extra: Dictionary = {}) -> int:
	if amount <= 0 or not items.has(item_id):
		return amount
	var def: Dictionary = items[item_id]
	var capacity: Dictionary = item_data.get("inventory_capacity", {"peso": 60, "volumen": 150})
	var by_weight := amount if float(def.get("peso", 0.0)) <= 0.0 else int(floor((float(capacity.peso) * 1.6 - item_weight()) / float(def.peso)))
	var by_volume := amount if float(def.get("vol", 0.0)) <= 0.0 else int(floor((float(capacity.volumen) - item_volume()) / float(def.vol)))
	var remaining := amount - mini(amount, maxi(0, mini(by_weight, by_volume)))
	var can_add := amount - remaining
	var maximum := int(def.get("apilable", 1))
	if maximum > 1:
		for i in range(inventory.size()):
			if can_add <= 0:
				break
			var slot = inventory[i]
			if slot != null and slot.id == item_id and int(slot.count) < maximum:
				var n := mini(maximum - int(slot.count), can_add)
				slot.count = int(slot.count) + n
				can_add -= n
				if def.has("pudre"):
					slot.freshness = (float(slot.get("freshness", 1.0)) * float(slot.count - n) + float(extra.get("freshness", 1.0)) * n) / float(slot.count)
	for i in range(inventory.size()):
		if can_add <= 0:
			break
		if inventory[i] == null:
			var n := mini(maximum, can_add)
			var slot := {"id": item_id, "count": n}
			if def.has("dur"):
				slot["durability"] = int(def.dur)
			if def.has("pudre"):
				slot["freshness"] = float(extra.get("freshness", 1.0))
			inventory[i] = slot
			can_add -= n
	remaining += can_add
	var added := amount - remaining
	if added > 0:
		_learn_recipes_from_item(item_id)
		inventory_changed.emit()
	return remaining

func _learn_recipes_from_item(item_id: String) -> void:
	for recipe in recipes:
		var rule = recipe.get("aprende")
		if rule is Dictionary and rule.get("tiene", "") == item_id:
			learn_recipe(str(recipe.get("clave", recipe.id)))

func learn_recipe(key: String) -> void:
	if not known_recipes.has(key):
		known_recipes.append(key)
		var recipe := get_recipe(key)
		if not recipe.is_empty():
			message("Nueva receta: %s" % items.get(str(recipe.id), {}).get("nombre", recipe.id))

func get_recipe(key: String) -> Dictionary:
	for recipe in recipes:
		if recipe.get("clave", recipe.get("id", "")) == key:
			return recipe
	return {}

func can_craft(recipe: Dictionary, at_fire: bool = false) -> bool:
	if not known_recipes.has(str(recipe.get("clave", recipe.get("id", "")))):
		return false
	if recipe.get("estacion", null) == "fogata" and not at_fire:
		return false
	for material in recipe.get("costo", {}).keys():
		if item_count(material) < int(recipe.costo[material]):
			return false
	var skill := str(recipe.get("hab", {}).get("tipo", ""))
	var required := int(recipe.get("hab", {}).get("nivel", 0))
	if required > _skill_level(skill):
		return false
	return true

func craft(recipe_key: String, at_fire: bool = false) -> bool:
	var recipe := get_recipe(recipe_key)
	if recipe.is_empty() or not can_craft(recipe, at_fire):
		return false
	for material in recipe.costo.keys():
		remove_item(str(material), int(recipe.costo[material]))
	var output_id := str(recipe.id)
	var output_amount := int(recipe.get("cantidad", 1))
	var before_output := item_count(output_id)
	var left := add_item(output_id, output_amount)
	if left > 0:
		var added_output := item_count(output_id) - before_output
		if added_output > 0:
			remove_item(output_id, added_output)
		# No se pierde el coste si el inventario se llenó por una condición de carrera.
		for material in recipe.costo.keys():
			add_item(str(material), int(recipe.costo[material]))
		return false
	var skill := str(recipe.get("hab", {}).get("tipo", "talla"))
	skills_xp[skill] = float(skills_xp.get(skill, 0.0)) + float(recipe.get("xp", 3))
	inventory_changed.emit()
	return true

func _skill_level(skill: String) -> int:
	var xp := float(skills_xp.get(skill, 0.0))
	var thresholds := [0, 15, 45, 110, 230, 420]
	var level := 0
	for i in range(1, thresholds.size()):
		if xp >= thresholds[i]:
			level = i
	return level

func remove_item(item_id: String, amount: int) -> bool:
	if item_count(item_id) < amount:
		return false
	var remaining := amount
	for i in range(inventory.size() - 1, -1, -1):
		var slot = inventory[i]
		if slot == null or slot.id != item_id:
			continue
		var count := mini(remaining, int(slot.count))
		slot.count = int(slot.count) - count
		remaining -= count
		if int(slot.count) <= 0:
			inventory[i] = null
		if remaining <= 0:
			break
	inventory_changed.emit()
	return true

func use_selected() -> bool:
	if inventory[selected_slot] == null:
		return false
	var slot: Dictionary = inventory[selected_slot]
	var item_id := str(slot.id)
	var def: Dictionary = items.get(item_id, {})
	var kind := str(def.get("tipo", ""))
	if kind == "comida" or kind == "bebida":
		var freshness := float(slot.get("freshness", 1.0))
		var benefit := 0.8 if freshness < 0.6 else 1.0
		stats.hambre = clampf(float(stats.hambre) + float(def.get("comida", 0.0)) * benefit, 0.0, 100.0)
		stats.sed = clampf(float(stats.sed) + float(def.get("sed", 0.0)), 0.0, 100.0)
		stats.vida = clampf(float(stats.vida) + float(def.get("vida", 0.0)), 1.0, 100.0)
		if freshness < 0.25:
			message("La comida está casi podrida. Te sienta mal.")
			stats.vida = maxf(1.0, float(stats.vida) - 8.0)
		_consume_slot(selected_slot)
		stats_changed.emit()
		return true
	if kind == "medicina":
		if item_id == "vendaje" and float(stats.vida) < 100.0:
			stats.vida = minf(100.0, float(stats.vida) + float(def.get("vida", 25.0)))
			_consume_slot(selected_slot)
			stats_changed.emit()
			return true
	return false

func _consume_slot(index: int) -> void:
	var slot = inventory[index]
	if slot == null:
		return
	slot.count = int(slot.count) - 1
	if int(slot.count) <= 0:
		inventory[index] = null
	inventory_changed.emit()

func damage(amount: float, reason: String = "Golpe") -> void:
	if dead or amount <= 0.0:
		return
	var factor: float = DIFFICULTY.get(difficulty, DIFFICULTY["Normal"]).damage
	stats.vida = maxf(0.0, float(stats.vida) - amount * factor)
	stats_changed.emit()
	if float(stats.vida) <= 0.0:
		dead = true
		game_active = false
		is_sleeping = false
		game_over.emit(reason)

func heal(amount: float) -> void:
	stats.vida = clampf(float(stats.vida) + amount, 0.0, 100.0)
	stats_changed.emit()

func message(text: String, seconds: float = 3.0) -> void:
	last_message = text
	message_timer = seconds
	message_changed.emit(text)

func pause_game(paused: bool) -> void:
	game_active = not paused and not dead
	if paused:
		is_sleeping = false

func die_and_respawn() -> void:
	dead = false
	game_active = true
	stats.vida = 60.0
	stats.hambre = 60.0
	stats.sed = 55.0
	is_sleeping = false
	if player_ref != null:
		player_ref.global_position = Vector3(0, 3, 4000)
	message("Has despertado en la costa. Lo que llevabas se quedó donde caíste.")
	stats_changed.emit()
