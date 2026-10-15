<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Herramientas internas de desarrollo
|--------------------------------------------------------------------------
|
| Solo se registran en el entorno local: con `route:cache` en producción
| estas rutas no existen. Incluir desde routes/web.php:
|
|     require __DIR__.'/dev.php';
|
*/

if (app()->environment('local')) {
    Route::middleware(['auth', 'verified'])->prefix('dev')->group(function () {
        Route::inertia('kai', 'dev/KaiLab')->name('dev.kai');
    });
}
