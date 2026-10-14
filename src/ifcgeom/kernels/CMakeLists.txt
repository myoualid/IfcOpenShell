message(STATUS "GEOMETRY_KERNELS ${GEOMETRY_KERNELS}")

ifcopenshell_wasm_plugin_dependency(plugin_when_not_wasm)

foreach(kernel ${GEOMETRY_KERNELS})
    string(TOUPPER ${kernel} KERNEL_UPPER)
    file(GLOB IFCGEOM_H_FILES ${kernel}/*.h)
    file(GLOB IFCGEOM_CPP_FILES ${kernel}/*.cpp)
    if(${kernel} STREQUAL "opencascade")
        list(REMOVE_ITEM IFCGEOM_CPP_FILES
            ${CMAKE_CURRENT_SOURCE_DIR}/${kernel}/tree_brep_plugin.cpp
            ${CMAKE_CURRENT_SOURCE_DIR}/${kernel}/tree_trianglebvh_plugin.cpp
        )
    endif()
    set(IFCGEOM_FILES ${IFCGEOM_CPP_FILES} ${IFCGEOM_H_FILES})

    set(KERNEL_TARGET "geometry_kernel_${kernel}")
    add_library(${KERNEL_TARGET} SHARED ${IFCGEOM_FILES})
    if((NOT WIN32) AND NOT WASM_BUILD AND NOT CREATE_BUNDLE AND NOT CMAKE_INSTALL_RPATH AND COMMAND SET_INSTALL_SELF_RPATH)
        SET_INSTALL_SELF_RPATH(${KERNEL_TARGET})
    endif()

    # Every kernel exports the symbols defined in its own objects. The
    # OpenCASCADE kernel additionally exports the OCCT symbols referenced by
    # the tree and serializer plugins; see wasm.cmake. Exporting every OCCT
    # symbol exceeds the JS engine's 100000-export limit.
    ifcopenshell_wasm_plugin_link_options(${KERNEL_TARGET} ifcopenshell_register_kernel_plugin_v1 EXPORT_DYNAMIC)

    set_target_properties(${KERNEL_TARGET} PROPERTIES
        COMPILE_FLAGS "-DIFC_GEOMLIBRARY_EXPORTS"
        OUTPUT_NAME "ifcopenshell_geometry_kernel_${kernel}"
        RUNTIME_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
        LIBRARY_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
    )
    ifcopenshell_native_plugin_target(${KERNEL_TARGET} IfcGeom)
    if(WASM_BUILD)
        ifcopenshell_wasm_configure_plugin_target(
            ${KERNEL_TARGET}
            KIND kernel
            ID "${kernel}"
            SYMBOL_ID "${kernel}"
            EXPORT_SYMBOL "ifcopenshell_emscripten_register_kernel_${kernel}"
        )
    endif()
    list(APPEND kernel_libraries ${KERNEL_TARGET})
    # The wasm OpenCASCADE kernel links a filtered toolkit list below.
    # Linking the full list here as well would put TKXMesh and the GL driver
    # back on the command line, and SIDE_MODULE=1 would then keep them.
    set(kernel_private_libs ${${KERNEL_UPPER}_LIBRARIES})
    if(WASM_BUILD AND kernel STREQUAL "opencascade")
        set(kernel_private_libs "")
    endif()
    ifcopenshell_wasm_plugin_target_link(${KERNEL_TARGET}
        MAIN_TARGETS IfcParse IfcGeom
        PRIVATE ${plugin_when_not_wasm} ${kernel_private_libs} Eigen3::Eigen
    )

    install(TARGETS ${KERNEL_TARGET})
    # Every OCCT consumer links the same toolkit list, so the kernel's
    # runtime DLL set covers the tree and serializer plug-ins too.
    ifcopenshell_install_runtime_dlls(TARGETS ${KERNEL_TARGET})

    if(${kernel} STREQUAL "cgal")
        set_property(TARGET ${KERNEL_TARGET} APPEND_STRING PROPERTY COMPILE_FLAGS " -DCGAL_HAS_THREADS")

        set(KERNEL_TARGET_SIMPLE "${KERNEL_TARGET}_simple")
        add_library(${KERNEL_TARGET_SIMPLE} SHARED ${IFCGEOM_FILES})
        if((NOT WIN32) AND NOT CREATE_BUNDLE AND NOT CMAKE_INSTALL_RPATH AND COMMAND SET_INSTALL_SELF_RPATH)
            SET_INSTALL_SELF_RPATH(${KERNEL_TARGET_SIMPLE})
        endif()

        ifcopenshell_wasm_plugin_link_options(${KERNEL_TARGET_SIMPLE} ifcopenshell_register_kernel_plugin_v1 EXPORT_DYNAMIC)

        set_target_properties(${KERNEL_TARGET_SIMPLE} PROPERTIES
            COMPILE_FLAGS "-DIFC_GEOMLIBRARY_EXPORTS -DIFOPSH_SIMPLE_KERNEL -DCGAL_HAS_THREADS"
            OUTPUT_NAME "ifcopenshell_geometry_kernel_cgalsimple"
            RUNTIME_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
            LIBRARY_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
        )
        ifcopenshell_native_plugin_target(${KERNEL_TARGET_SIMPLE} IfcGeom)
        if(WASM_BUILD)
            ifcopenshell_wasm_configure_plugin_target(
                ${KERNEL_TARGET_SIMPLE}
                KIND kernel
                ID "cgalsimple"
                SYMBOL_ID "cgalsimple"
                EXPORT_SYMBOL "ifcopenshell_emscripten_register_kernel_cgalsimple"
            )
        endif()
        list(APPEND kernel_libraries ${KERNEL_TARGET_SIMPLE})
        ifcopenshell_wasm_plugin_target_link(${KERNEL_TARGET_SIMPLE}
            MAIN_TARGETS IfcParse IfcGeom
            PRIVATE ${plugin_when_not_wasm} ${${KERNEL_UPPER}_LIBRARIES} Eigen3::Eigen IFCOPENSHELL_CGAL
        )
        install(TARGETS ${KERNEL_TARGET_SIMPLE})
    elseif(${kernel} STREQUAL "opencascade")
        if (WASM_BUILD)
            # TKMesh and TKXMesh both export the same DISCRETALGO meshing plugin entry point.
            # Keep TKMesh and drop TKXMesh so wasm-ld sees a single OCCT discretizer.
            # The GL driver and mesh-visualization toolkits are not used headless,
            # and whole-archive would otherwise keep their GLES imports.
            set(OCCT_LIBS_FILTERED ${OpenCASCADE_LIBRARIES})
            list(FILTER OCCT_LIBS_FILTERED EXCLUDE REGEX "TKXMesh|TKOpenGl|TKMeshVS")
            target_link_libraries(${KERNEL_TARGET} PRIVATE
                "-Wl,--start-group"
                ${OCCT_LIBS_FILTERED}
                "-Wl,--end-group"
            )
        else()
            target_link_libraries(${KERNEL_TARGET} PRIVATE ${OpenCASCADE_LIBRARIES})
        endif()

        foreach(tree_backend brep trianglebvh)
            set(TREE_TARGET "geometry_tree_opencascade_${tree_backend}")
            if(${tree_backend} STREQUAL "brep")
                set(TREE_IMPLEMENTATION ub_tree.h)
            else()
                set(TREE_IMPLEMENTATION bvh_tree.h)
            endif()
            add_library(${TREE_TARGET} SHARED
                ${kernel}/tree_${tree_backend}_plugin.cpp
                ${kernel}/${TREE_IMPLEMENTATION}
            )
            if((NOT WIN32) AND NOT CREATE_BUNDLE AND NOT CMAKE_INSTALL_RPATH AND COMMAND SET_INSTALL_SELF_RPATH)
                SET_INSTALL_SELF_RPATH(${TREE_TARGET})
            endif()
            set_target_properties(${TREE_TARGET} PROPERTIES
                COMPILE_FLAGS "-DIFC_GEOMLIBRARY_EXPORTS"
                OUTPUT_NAME "ifcopenshell_geometry_tree_opencascade_${tree_backend}"
                RUNTIME_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
                LIBRARY_OUTPUT_DIRECTORY "${kernel_plugin_runtime_dir}"
            )
            ifcopenshell_native_plugin_target(${TREE_TARGET} IfcGeom)
            if(WASM_BUILD)
                ifcopenshell_wasm_configure_plugin_target(
                    ${TREE_TARGET}
                    KIND tree
                    ID "opencascade.${tree_backend}"
                    SYMBOL_ID "opencascade_${tree_backend}"
                    EXPORT_SYMBOL "ifcopenshell_emscripten_register_tree_opencascade_${tree_backend}"
                    DEPENDS "kernel:opencascade"
                )
            endif()
            list(APPEND tree_libraries ${TREE_TARGET})
            if(WASM_BUILD)
                # Tree plugins compile against OCCT headers but do not link OCCT.
                # geometry_kernel_opencascade exports the OCCT symbols these
                # objects reference. Linking OCCT here as well would copy it
                # into every tree and serializer plugin.
                if(WITH_OPENCASCADE AND OCC_INCLUDE_DIR)
                    target_include_directories(${TREE_TARGET} PRIVATE "${OCC_INCLUDE_DIR}")
                endif()
                ifcopenshell_wasm_plugin_target_link(${TREE_TARGET}
                    MAIN_TARGETS IfcParse IfcGeom
                    PRIVATE ${plugin_when_not_wasm} Eigen3::Eigen
                )
            else()
                target_link_libraries(${TREE_TARGET} PRIVATE plugin IfcGeom geometry_kernel_opencascade ${OpenCASCADE_LIBRARIES} Eigen3::Eigen)
            endif()
            ifcopenshell_wasm_plugin_link_options(${TREE_TARGET} ifcopenshell_register_tree_plugin_v1)
            install(TARGETS ${TREE_TARGET})
        endforeach()
        if(WASM_BUILD)
            # Same directory as the kernel target: PRE_LINK has to be registered here.
            # Pull in OCCT members referenced by the tree and serializer plugins and
            # export those symbols. Exporting every OCCT symbol exceeds the JS
            # engine's 100000-export limit.
            get_target_property(occt_export_rsp geometry_kernel_opencascade IFCOPENSHELL_WASM_EXPORT_RSP)
            get_filename_component(ifcos_repo_root "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
            set(occt_export_script "${ifcos_repo_root}/cmake/wasm_export_dynamic.py")
            set(occt_consumer_object_dirs
                "${CMAKE_CURRENT_BINARY_DIR}/CMakeFiles/geometry_tree_opencascade_brep.dir"
                "${CMAKE_CURRENT_BINARY_DIR}/CMakeFiles/geometry_tree_opencascade_trianglebvh.dir"
                "${CMAKE_BINARY_DIR}/serializers/CMakeFiles/geometry_serializer_stp.dir"
                "${CMAKE_BINARY_DIR}/serializers/CMakeFiles/geometry_serializer_igs.dir"
                "${CMAKE_BINARY_DIR}/serializers/CMakeFiles/geometry_serializer_svg.dir"
                "${CMAKE_BINARY_DIR}/serializers/CMakeFiles/geometry_serializer_ttl.dir"
            )
            set(occt_consumer_dir_args)
            foreach(consumer_dir IN LISTS occt_consumer_object_dirs)
                list(APPEND occt_consumer_dir_args --undefined-objects-dir "${consumer_dir}")
            endforeach()
            if(CMAKE_HOST_WIN32)
                add_custom_command(
                    TARGET geometry_kernel_opencascade PRE_LINK
                    COMMAND py -3 "${occt_export_script}" --append --output "${occt_export_rsp}" ${occt_consumer_dir_args}
                    VERBATIM
                )
            else()
                add_custom_command(
                    TARGET geometry_kernel_opencascade PRE_LINK
                    COMMAND python3 "${occt_export_script}" --append --output "${occt_export_rsp}" ${occt_consumer_dir_args}
                    VERBATIM
                )
            endif()
        endif()
    endif()

    install(FILES ${IFCGEOM_H_FILES}
        DESTINATION ${INCLUDEDIR}/ifcgeom/kernels/${kernel}
    )
endforeach()

install(FILES ifc_geomlibrary_api.h
    DESTINATION ${INCLUDEDIR}/ifcgeom/kernels
)

set(kernel_libraries ${kernel_libraries} PARENT_SCOPE)
set(tree_libraries ${tree_libraries} PARENT_SCOPE)
