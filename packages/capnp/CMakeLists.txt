cmake_minimum_required(VERSION 3.16)
project(verify_capnp_c LANGUAGES C CXX)

set(CAPNP_ROOT "" CACHE PATH "Path to Cap'n Proto source tree (contains c++/src)")
set(CAPNP_GENERATED_DIR "" CACHE PATH "Path to generated .capnp C++ files")

if (CAPNP_ROOT STREQUAL "" OR CAPNP_GENERATED_DIR STREQUAL "")
  message(FATAL_ERROR "Set CAPNP_ROOT and CAPNP_GENERATED_DIR to build verify_capnp_c.")
endif()

add_library(verify_capnp_c STATIC
  src/verify_capnp_c.cpp
)

target_include_directories(verify_capnp_c
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CAPNP_GENERATED_DIR}
    ${CAPNP_ROOT}/c++/src
)

target_link_libraries(verify_capnp_c PUBLIC capnp kj)
