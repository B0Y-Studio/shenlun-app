if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/hecto/.gradle/caches/transforms-4/a0cc356e0fd31c7fca940b60d09df26a/transformed/jetified-hermes-android-0.74.5-debug/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/hecto/.gradle/caches/transforms-4/a0cc356e0fd31c7fca940b60d09df26a/transformed/jetified-hermes-android-0.74.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

