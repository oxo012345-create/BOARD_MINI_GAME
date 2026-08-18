$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot "standalone"
$publicRoot = Join-Path $projectRoot "public"
$nestedRoot = Join-Path $publicRoot "game"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Path $nestedRoot -Force | Out-Null

$sourceFiles = @(
  "index.html",
  "styles.css",
  "map.js",
  "characters.html",
  "characters.css",
  "characters.js"
)

foreach ($file in $sourceFiles) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $nestedRoot -Force
}
Copy-Item -LiteralPath (Join-Path $sourceRoot "assets") -Destination $nestedRoot -Recurse -Force

$flatFiles = @{
  "index.html" = "game-index.html"
  "styles.css" = "game-styles.css"
  "map.js" = "game-map.js"
  "characters.html" = "game-characters.html"
  "characters.css" = "game-characters.css"
  "characters.js" = "game-characters.js"
}
foreach ($entry in $flatFiles.GetEnumerator()) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $entry.Key) -Destination (Join-Path $publicRoot $entry.Value) -Force
}

$assetCopies = @(
  @("assets\audio\bgm\ice-silly-pups-in-snow.mp3", "bgm-ice.mp3"),
  @("assets\audio\bgm\lava-upbeat-rpg-battle.mp3", "bgm-lava.mp3"),
  @("assets\audio\bgm\space-magical-technology.mp3", "bgm-space.mp3"),
  @("assets\lava\cloud.png", "lava-cloud.png"),
  @("assets\lava\lavatile.jpg", "lava-tile.jpg"),
  @("assets\pbr\snow_02-diffuse.jpg", "snow-diffuse.jpg"),
  @("assets\pbr\snow_02-normal.jpg", "snow-normal.jpg"),
  @("assets\pbr\snow_02-rough.jpg", "snow-rough.jpg"),
  @("assets\pbr\snow_02-displacement.jpg", "snow-displacement.jpg")
)
foreach ($copy in $assetCopies) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $copy[0]) -Destination (Join-Path $publicRoot $copy[1]) -Force
}
Get-ChildItem -LiteralPath (Join-Path $sourceRoot "assets\audio\sfx\processed") -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $publicRoot ("sfx-" + $_.Name)) -Force
}

function Replace-InFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][array]$Replacements
  )
  $content = [System.IO.File]::ReadAllText($Path)
  foreach ($replacement in $Replacements) {
    $content = $content.Replace($replacement[0], $replacement[1])
  }
  [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

Replace-InFile -Path (Join-Path $publicRoot "game-index.html") -Replacements @(
  @("./styles.css", "./game-styles.css"),
  @("./characters.html", "./game-characters.html"),
  @("./map.js", "./game-map.js")
)

Replace-InFile -Path (Join-Path $publicRoot "game-characters.html") -Replacements @(
  @("./characters.css", "./game-characters.css"),
  @("./characters.js", "./game-characters.js")
)

Replace-InFile -Path (Join-Path $publicRoot "game-characters.js") -Replacements @(
  @("./index.html", "./game-index.html")
)

Replace-InFile -Path (Join-Path $publicRoot "game-map.js") -Replacements @(
  @("./assets/audio/bgm/ice-silly-pups-in-snow.mp3", "./bgm-ice.mp3"),
  @("./assets/audio/bgm/lava-upbeat-rpg-battle.mp3", "./bgm-lava.mp3"),
  @("./assets/audio/bgm/space-magical-technology.mp3", "./bgm-space.mp3"),
  @("./assets/audio/sfx/processed/", "./sfx-"),
  @("./assets/lava/cloud.png", "./lava-cloud.png"),
  @("./assets/lava/lavatile.jpg", "./lava-tile.jpg"),
  @("./assets/pbr/snow_02-diffuse.jpg", "./snow-diffuse.jpg"),
  @("./assets/pbr/snow_02-normal.jpg", "./snow-normal.jpg"),
  @("./assets/pbr/snow_02-rough.jpg", "./snow-rough.jpg"),
  @("./assets/pbr/snow_02-displacement.jpg", "./snow-displacement.jpg")
)

Write-Output "Synced standalone game to public assets."
