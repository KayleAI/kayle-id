#ifndef VERIFY_CAPNP_C_H
#define VERIFY_CAPNP_C_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum verify_data_kind {
  VERIFY_DATA_DG1 = 0,
  VERIFY_DATA_DG2 = 1,
  VERIFY_DATA_SOD = 2,
  VERIFY_DATA_SELFIE = 3
} verify_data_kind_t;

typedef enum verify_server_message_kind {
  VERIFY_SERVER_MESSAGE_NONE = 0,
  VERIFY_SERVER_MESSAGE_ACK = 1,
  VERIFY_SERVER_MESSAGE_ERROR = 2
} verify_server_message_kind_t;

// The builder and reader pointers are opaque pointers from CapnpCLib:
// - capnp_c_message_builder_get()
// - capnp_c_message_reader_get()

int verify_build_hello(
  void* message_builder,
  const char* attempt_id,
  const char* mobile_write_token,
  const char* device_id,
  const char* app_version
);

int verify_build_phase(
  void* message_builder,
  const char* phase,
  const char* error
);

int verify_build_data(
  void* message_builder,
  int data_kind,
  const uint8_t* raw,
  size_t raw_size,
  uint32_t index,
  uint32_t total,
  uint32_t chunk_index,
  uint32_t chunk_total
);

verify_server_message_kind_t verify_server_message_kind(void* message_reader);

int verify_server_message_get_ack(
  void* message_reader,
  char* out_message,
  size_t out_message_size
);

int verify_server_message_get_error(
  void* message_reader,
  char* out_code,
  size_t out_code_size,
  char* out_message,
  size_t out_message_size
);

#ifdef __cplusplus
}
#endif

#endif // VERIFY_CAPNP_C_H
